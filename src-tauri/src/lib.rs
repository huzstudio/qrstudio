#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      render_qr_preview,
      export_qr_asset,
      export_qr_files,
      run_qr_decode_test,
      validate_qr_design
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

use base64::{engine::general_purpose, Engine as _};
use flate2::{write::ZlibEncoder, Compression};
use image::{imageops, DynamicImage, GenericImageView, ImageFormat, Rgba, RgbaImage};
use qrcode::{Color, EcLevel, QrCode};
use resvg::{tiny_skia, usvg};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Cursor;
use std::io::Write;
use std::path::{Path, PathBuf};

const PREVIEW_SIZE: u32 = 768;
const MAX_RASTER_SIDE: u32 = 12_000;
const MAX_RASTER_PIXELS: u64 = 96_000_000;
const MAX_EXPORT_REQUESTS: usize = 250;
const MAX_LOGO_BYTES: usize = 5 * 1024 * 1024;
const MAX_LOGO_PIXELS: u64 = 16_000_000;
const FRAME_01: &str = include_str!("../assets/frames/Scan-me-01.svg");
const FRAME_02: &str = include_str!("../assets/frames/Scan-me-02.svg");
const FRAME_03: &str = include_str!("../assets/frames/Scan-me-03.svg");
const FRAME_04: &str = include_str!("../assets/frames/Scan-me-04.svg");
const FRAME_05: &str = include_str!("../assets/frames/Scan-me-05.svg");
const FRAME_06: &str = include_str!("../assets/frames/Scan-me-06.svg");
const FRAME_07: &str = include_str!("../assets/frames/Scan-me-07.svg");
const FRAME_08: &str = include_str!("../assets/frames/Scan-me-08.svg");
const FRAME_09: &str = include_str!("../assets/frames/Scan-me-09.svg");
const FRAME_10: &str = include_str!("../assets/frames/Scan-me-10.svg");
const FRAME_11: &str = include_str!("../assets/frames/Scan-me-11.svg");

#[derive(Clone, Copy)]
struct FrameSlot {
  x: f32,
  y: f32,
  size: f32,
}

#[derive(Clone, Copy)]
struct FrameDefinition {
  id: &'static str,
  svg: &'static str,
  width: f32,
  height: f32,
  slot: FrameSlot,
  color_targets: &'static [&'static str],
  sample_fill: Option<&'static str>,
}

const FRAME_DEFINITIONS: &[FrameDefinition] = &[
  FrameDefinition {
    id: "frame-01",
    svg: FRAME_01,
    width: 151.0,
    height: 128.0,
    slot: FrameSlot { x: 8.0, y: 8.0, size: 78.0 },
    color_targets: &["black"],
    sample_fill: None,
  },
  FrameDefinition {
    id: "frame-02",
    svg: FRAME_02,
    width: 151.0,
    height: 128.0,
    slot: FrameSlot { x: 12.0, y: 38.0, size: 78.0 },
    color_targets: &["black"],
    sample_fill: None,
  },
  FrameDefinition {
    id: "frame-03",
    svg: FRAME_03,
    width: 151.0,
    height: 128.0,
    slot: FrameSlot { x: 8.0, y: 8.0, size: 84.0 },
    color_targets: &["black"],
    sample_fill: None,
  },
  FrameDefinition {
    id: "frame-04",
    svg: FRAME_04,
    width: 151.0,
    height: 111.0,
    slot: FrameSlot { x: 50.416, y: 10.256, size: 89.711 },
    color_targets: &["#718C31"],
    sample_fill: Some("#718C31"),
  },
  FrameDefinition {
    id: "frame-05",
    svg: FRAME_05,
    width: 151.0,
    height: 293.0,
    slot: FrameSlot { x: 24.694, y: 165.934, size: 100.969 },
    color_targets: &["#2076A8"],
    sample_fill: Some("#2076A8"),
  },
  FrameDefinition {
    id: "frame-06",
    svg: FRAME_06,
    width: 151.0,
    height: 282.0,
    slot: FrameSlot { x: 21.232, y: 23.294, size: 107.910 },
    color_targets: &["#2076A8"],
    sample_fill: Some("#2076A8"),
  },
  FrameDefinition {
    id: "frame-07",
    svg: FRAME_07,
    width: 325.0,
    height: 126.0,
    slot: FrameSlot { x: 222.843, y: 24.028, size: 77.876 },
    color_targets: &["#F5382C"],
    sample_fill: Some("white"),
  },
  FrameDefinition {
    id: "frame-08",
    svg: FRAME_08,
    width: 325.0,
    height: 122.0,
    slot: FrameSlot { x: 228.672, y: 25.358, size: 70.716 },
    color_targets: &["#F5382C"],
    sample_fill: Some("#F5382C"),
  },
  FrameDefinition {
    id: "frame-09",
    svg: FRAME_09,
    width: 325.0,
    height: 135.0,
    slot: FrameSlot { x: 206.624, y: 16.425, size: 101.683 },
    color_targets: &["#E79312"],
    sample_fill: Some("#E79312"),
  },
  FrameDefinition {
    id: "frame-10",
    svg: FRAME_10,
    width: 151.0,
    height: 78.0,
    slot: FrameSlot { x: 9.732, y: 9.732, size: 57.559 },
    color_targets: &["#718C31"],
    sample_fill: Some("#718C31"),
  },
  FrameDefinition {
    id: "frame-11",
    svg: FRAME_11,
    width: 151.0,
    height: 86.0,
    slot: FrameSlot { x: 13.678, y: 13.209, size: 58.745 },
    color_targets: &["#E79312"],
    sample_fill: Some("#E79312"),
  },
];

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct QrRequest {
  payload: String,
  error_correction: String,
  margin: u32,
  module_shape: String,
  finder_shape: String,
  foreground: String,
  background: String,
  finder_foreground: String,
  separate_finders: bool,
  transparent_background: bool,
  frame_template: String,
  frame_text: String,
  frame_accent: String,
  logo: Option<LogoRequest>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LogoRequest {
  data_url: String,
  scale: f32,
  padding: u32,
  card_color: String,
  radius: u32,
  circle_card: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PreviewResponse {
  svg: String,
  stats: QrStats,
  warnings: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportResponse {
  file_name: String,
  mime_type: String,
  base64_data: String,
  warnings: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SavedExportResponse {
  paths: Vec<String>,
  warnings: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DecodeTestResponse {
  success: bool,
  decoded_text: Option<String>,
  message: String,
  warnings: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct QrStats {
  modules: usize,
  dark_modules: usize,
  density: f32,
  preview_size: u32,
  estimated_png_memory_mb: f32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportRequest {
  qr: QrRequest,
  format: String,
  size: u32,
  file_name: String,
}

struct ExportBytes {
  file_name: String,
  mime_type: String,
  bytes: Vec<u8>,
  warnings: Vec<String>,
}

struct ExportMetadata {
  file_name: String,
  mime_type: String,
}

#[tauri::command]
fn render_qr_preview(request: QrRequest) -> Result<PreviewResponse, String> {
  validate_qr_request(&request)?;
  let matrix = build_matrix(&request)?;
  let stats = make_stats(&matrix, PREVIEW_SIZE);
  let warnings = warnings_for(&request, &matrix, PREVIEW_SIZE);
  let svg = render_svg(&request, &matrix, PREVIEW_SIZE)?;
  Ok(PreviewResponse { svg, stats, warnings })
}

#[tauri::command]
async fn export_qr_asset(request: ExportRequest) -> Result<ExportResponse, String> {
  tauri::async_runtime::spawn_blocking(move || export_asset(request))
    .await
    .map_err(|err| format!("Export task failed: {err}"))?
}

#[tauri::command]
async fn export_qr_files(requests: Vec<ExportRequest>) -> Result<SavedExportResponse, String> {
  tauri::async_runtime::spawn_blocking(move || save_export_files(requests))
    .await
    .map_err(|err| format!("Export save task failed: {err}"))?
}

#[tauri::command]
async fn run_qr_decode_test(request: QrRequest) -> Result<DecodeTestResponse, String> {
  tauri::async_runtime::spawn_blocking(move || decode_test(request))
    .await
    .map_err(|err| format!("Decode task failed: {err}"))?
}

#[tauri::command]
fn validate_qr_design(request: QrRequest, size: u32) -> Result<Vec<String>, String> {
  validate_qr_request(&request)?;
  let matrix = build_matrix(&request)?;
  Ok(warnings_for(&request, &matrix, size))
}

fn export_asset(request: ExportRequest) -> Result<ExportResponse, String> {
  let asset = export_asset_bytes(request)?;
  Ok(ExportResponse {
    file_name: asset.file_name,
    mime_type: asset.mime_type,
    base64_data: general_purpose::STANDARD.encode(asset.bytes),
    warnings: asset.warnings,
  })
}

fn export_metadata(request: &ExportRequest) -> ExportMetadata {
  let format = request.format.to_lowercase();
  let (extension, mime_type) = match format.as_str() {
    "svg" => ("svg", "image/svg+xml"),
    "jpg" | "jpeg" => ("jpg", "image/jpeg"),
    "webp" => ("webp", "image/webp"),
    "pdf" => ("pdf", "application/pdf"),
    _ => ("png", "image/png"),
  };

  ExportMetadata {
    file_name: with_extension(&request.file_name, extension),
    mime_type: mime_type.into(),
  }
}

fn save_export_files(requests: Vec<ExportRequest>) -> Result<SavedExportResponse, String> {
  if requests.is_empty() {
    return Err("ERR_EXPORT_EMPTY".into());
  }
  if requests.len() > MAX_EXPORT_REQUESTS {
    return Err(format!("ERR_EXPORT_TOO_MANY:{MAX_EXPORT_REQUESTS}"));
  }

  if requests.len() == 1 {
    let request = requests.into_iter().next().ok_or_else(|| "ERR_EXPORT_EMPTY".to_string())?;
    let metadata = export_metadata(&request);
    let path = rfd::FileDialog::new()
      .set_file_name(&metadata.file_name)
      .add_filter(filter_label(&metadata.mime_type), &[file_extension(&metadata.file_name)])
      .save_file();
    let Some(path) = path else {
      return Err("ERR_SAVE_CANCELLED".into());
    };
    let asset = export_asset_bytes(request)?;
    write_bytes(&path, &asset.bytes)?;
    return Ok(SavedExportResponse {
      paths: vec![path.to_string_lossy().to_string()],
      warnings: asset.warnings,
    });
  }

  let folder = rfd::FileDialog::new()
    .set_title("Select QR export folder")
    .pick_folder();
  let Some(folder) = folder else {
    return Err("ERR_FOLDER_CANCELLED".into());
  };

  let mut paths = Vec::with_capacity(requests.len());
  let mut warnings = Vec::new();
  for request in requests {
    let asset = export_asset_bytes(request)?;
    let path = unique_path(&folder, &asset.file_name);
    write_bytes(&path, &asset.bytes)?;
    warnings.extend(asset.warnings);
    paths.push(path.to_string_lossy().to_string());
  }

  Ok(SavedExportResponse { paths, warnings })
}

fn export_asset_bytes(request: ExportRequest) -> Result<ExportBytes, String> {
  validate_qr_request(&request.qr)?;
  let matrix = build_matrix(&request.qr)?;
  let format = request.format.to_lowercase();
  let mut warnings = warnings_for(&request.qr, &matrix, request.size);

  if format == "svg" {
    let svg = render_svg(&request.qr, &matrix, request.size)?;
    return Ok(ExportBytes {
      file_name: with_extension(&request.file_name, "svg"),
      mime_type: "image/svg+xml".into(),
      bytes: svg.into_bytes(),
      warnings,
    });
  }

  if format == "pdf" {
    let pdf_size = request.size.clamp(512, 4096);
    if pdf_size != request.size {
      warnings.push("pdf-size-clamped".into());
    }
    let image = render_raster(&request.qr, &matrix, pdf_size)?;
    return Ok(ExportBytes {
      file_name: with_extension(&request.file_name, "pdf"),
      mime_type: "application/pdf".into(),
      bytes: render_pdf_from_image(image)?,
      warnings,
    });
  }

  guard_raster_size(request.size)?;
  let image = render_raster(&request.qr, &matrix, request.size)?;
  let mut cursor = Cursor::new(Vec::<u8>::new());

  let (extension, mime, image_format) = match format.as_str() {
    "jpg" | "jpeg" => ("jpg", "image/jpeg", ImageFormat::Jpeg),
    "webp" => ("webp", "image/webp", ImageFormat::WebP),
    _ => ("png", "image/png", ImageFormat::Png),
  };

  if image_format == ImageFormat::Jpeg {
    DynamicImage::ImageRgba8(image)
      .to_rgb8()
      .write_to(&mut cursor, image_format)
      .map_err(|err| format!("Could not encode JPG: {err}"))?;
  } else {
    DynamicImage::ImageRgba8(image)
      .write_to(&mut cursor, image_format)
      .map_err(|err| format!("Could not encode image: {err}"))?;
  }

  Ok(ExportBytes {
    file_name: with_extension(&request.file_name, extension),
    mime_type: mime.into(),
    bytes: cursor.into_inner(),
    warnings,
  })
}

fn decode_test(request: QrRequest) -> Result<DecodeTestResponse, String> {
  validate_qr_request(&request)?;
  let matrix = build_matrix(&request)?;
  let warnings = warnings_for(&request, &matrix, PREVIEW_SIZE);
  let image = render_raster(&request, &matrix, PREVIEW_SIZE)?;
  let gray = DynamicImage::ImageRgba8(image).to_luma8();
  let mut prepared = rqrr::PreparedImage::prepare(gray);
  let grids = prepared.detect_grids();

  for grid in grids {
    if let Ok((_meta, decoded_text)) = grid.decode() {
      let success = decoded_text == request.payload;
      return Ok(DecodeTestResponse {
        success,
        decoded_text: Some(decoded_text),
        message: if success {
          "Decode testi basarili: uretilen QR tekrar okunabiliyor.".into()
        } else {
          "Decode testi QR'i okudu ama payload beklenen metinle ayni degil.".into()
        },
        warnings,
      });
    }
  }

  Ok(DecodeTestResponse {
    success: false,
    decoded_text: None,
    message: "Decode testi QR'i okuyamadi. Logo, dusuk kontrast veya agresif modul sekli taramayi zorlastiriyor olabilir.".into(),
    warnings,
  })
}

fn validate_qr_request(request: &QrRequest) -> Result<(), String> {
  if let Some(logo) = &request.logo {
    guard_logo_data_url(&logo.data_url)?;
  }
  Ok(())
}

fn build_matrix(request: &QrRequest) -> Result<Vec<Vec<bool>>, String> {
  let level = match request.error_correction.as_str() {
    "L" => EcLevel::L,
    "Q" => EcLevel::Q,
    "H" => EcLevel::H,
    _ => EcLevel::M,
  };
  let code = QrCode::with_error_correction_level(request.payload.as_bytes(), level)
    .map_err(|err| format!("QR payload could not be encoded: {err}"))?;
  let width = code.width();
  let mut matrix = vec![vec![false; width]; width];

  for y in 0..width {
    for x in 0..width {
      matrix[y][x] = code[(x, y)] == Color::Dark;
    }
  }

  Ok(matrix)
}

fn render_svg(request: &QrRequest, matrix: &[Vec<bool>], size: u32) -> Result<String, String> {
  if let Some(frame) = frame_definition(&request.frame_template) {
    return render_framed_svg(request, matrix, size, frame);
  }

  let framed = request.frame_template != "none";
  let modules = matrix.len() as u32;
  let margin = request.margin.min(16);
  let total_units = modules + margin * 2;
  let qr_size = if framed { size as f32 * 0.72 } else { size as f32 };
  let qr_x = if framed { (size as f32 - qr_size) / 2.0 } else { 0.0 };
  let qr_y = if framed { size as f32 * 0.1 } else { 0.0 };
  let unit = qr_size / total_units as f32;
  let bg = parse_color(&request.background)?;
  let fg = parse_color(&request.foreground)?;
  let finder_fg = parse_color(&request.finder_foreground)?;
  let accent = parse_color(&request.frame_accent).unwrap_or(finder_fg);
  let card = request
    .logo
    .as_ref()
    .map(|logo| parse_color(&logo.card_color))
    .transpose()?;
  let mut svg = String::with_capacity(matrix.len() * matrix.len() * 80);

  svg.push_str(&format!(
    r#"<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}" shape-rendering="geometricPrecision">"#
  ));

  if !request.transparent_background {
    svg.push_str(&format!(r#"<rect width="100%" height="100%" fill="{}"/>"#, rgba_to_css(bg)));
  }
  if framed {
    let pad = size as f32 * 0.045;
    svg.push_str(&format!(
      r#"<rect x="{pad:.2}" y="{pad:.2}" width="{:.2}" height="{:.2}" rx="{:.2}" fill="none" stroke="{}" stroke-width="{:.2}"/>"#,
      size as f32 - pad * 2.0,
      size as f32 - pad * 2.0,
      size as f32 * 0.035,
      rgba_to_css(accent),
      (size as f32 * 0.012).max(4.0)
    ));
  }

  for (y, row) in matrix.iter().enumerate() {
    for (x, dark) in row.iter().enumerate() {
      if !dark {
        continue;
      }
      let is_finder = is_finder_module(x, y, matrix.len());
      let color = if request.separate_finders && is_finder { finder_fg } else { fg };
      let px = qr_x + (margin as f32 + x as f32) * unit;
      let py = qr_y + (margin as f32 + y as f32) * unit;
      svg.push_str(&svg_module(
        px,
        py,
        unit,
        rgba_to_css(color),
        if is_finder { &request.finder_shape } else { &request.module_shape },
      ));
    }
  }

  if let Some(logo) = &request.logo {
    let logo_size = (qr_size * logo.scale.clamp(0.08, 0.34)).round();
    let padding = logo.padding as f32;
    let card_size = logo_size + padding * 2.0;
    let x = qr_x + (qr_size - card_size) / 2.0;
    let y = qr_y + (qr_size - card_size) / 2.0;
    let radius = if logo.circle_card {
      card_size / 2.0
    } else {
      (logo.radius as f32).min(card_size / 2.0)
    };
    let card_fill = card.map(rgba_to_css).unwrap_or_else(|| "#ffffff".into());
    svg.push_str(&format!(
      r#"<rect x="{x:.2}" y="{y:.2}" width="{card_size:.2}" height="{card_size:.2}" rx="{radius:.2}" fill="{card_fill}"/>"#
    ));
    svg.push_str(&format!(
      r#"<image href="{}" x="{:.2}" y="{:.2}" width="{:.2}" height="{:.2}" preserveAspectRatio="xMidYMid meet"/>"#,
      escape_attr(&logo.data_url),
      x + padding,
      y + padding,
      logo_size,
      logo_size
    ));
  }

  if framed {
    let text = if request.frame_text.trim().is_empty() {
      default_frame_text(&request.frame_template)
    } else {
      request.frame_text.trim()
    };
    svg.push_str(&format!(
      r#"<text x="{}" y="{}" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="{}" font-weight="700" fill="{}">{}</text>"#,
      size / 2,
      (size as f32 * 0.9) as u32,
      (size as f32 * 0.052).max(18.0),
      rgba_to_css(accent),
      escape_text(text)
    ));
  }

  svg.push_str("</svg>");
  Ok(svg)
}

fn render_framed_svg(
  request: &QrRequest,
  matrix: &[Vec<bool>],
  size: u32,
  frame: FrameDefinition,
) -> Result<String, String> {
  let scale = size as f32 / frame.width.max(frame.height);
  let canvas_width = (frame.width * scale).round().max(1.0) as u32;
  let canvas_height = (frame.height * scale).round().max(1.0) as u32;
  let mut svg = String::with_capacity(frame.svg.len() + matrix.len() * matrix.len() * 80);
  let background = parse_color(&request.background)?;
  let frame_inner = strip_svg_root(frame.svg)?;
  let cleaned_frame = remove_sample_qr_paths(frame_inner, frame);
  let frame_svg = colorize_frame_svg(&cleaned_frame, request, frame);

  svg.push_str(&format!(
    r#"<svg xmlns="http://www.w3.org/2000/svg" width="{canvas_width}" height="{canvas_height}" viewBox="0 0 {:.3} {:.3}" shape-rendering="geometricPrecision">"#,
    frame.width, frame.height
  ));
  if !request.transparent_background {
    svg.push_str(&format!(
      r#"<rect width="100%" height="100%" fill="{}"/>"#,
      rgba_to_css(background)
    ));
  }
  svg.push_str(&frame_svg);
  if !request.transparent_background {
    svg.push_str(&format!(
      r#"<rect x="{:.3}" y="{:.3}" width="{:.3}" height="{:.3}" fill="{}"/>"#,
      frame.slot.x - 0.1,
      frame.slot.y - 0.1,
      frame.slot.size + 0.2,
      frame.slot.size + 0.2,
      rgba_to_css(background)
    ));
  }
  append_qr_svg(
    &mut svg,
    request,
    matrix,
    frame.slot.x,
    frame.slot.y,
    frame.slot.size,
  )?;
  svg.push_str("</svg>");
  Ok(svg)
}

fn render_raster(request: &QrRequest, matrix: &[Vec<bool>], size: u32) -> Result<RgbaImage, String> {
  if frame_definition(&request.frame_template).is_some() {
    let svg = render_svg(request, matrix, size)?;
    return rasterize_svg(&svg);
  }

  let framed = request.frame_template != "none";
  let modules = matrix.len() as u32;
  let margin = request.margin.min(16);
  let total_units = modules + margin * 2;
  let qr_size = if framed { size as f32 * 0.72 } else { size as f32 };
  let qr_x = if framed { (size as f32 - qr_size) / 2.0 } else { 0.0 };
  let qr_y = if framed { size as f32 * 0.1 } else { 0.0 };
  let unit = qr_size / total_units as f32;
  let bg = parse_color(&request.background)?;
  let fg = parse_color(&request.foreground)?;
  let finder_fg = parse_color(&request.finder_foreground)?;
  let accent = parse_color(&request.frame_accent).unwrap_or(finder_fg);
  let mut image = RgbaImage::from_pixel(
    size,
    size,
    if request.transparent_background { Rgba([0, 0, 0, 0]) } else { bg },
  );
  if framed {
    let pad = (size as f32 * 0.045).round() as i32;
    let stroke = (size as f32 * 0.012).round().max(4.0) as i32;
    draw_frame_border(&mut image, pad, stroke, accent);
  }

  for (y, row) in matrix.iter().enumerate() {
    for (x, dark) in row.iter().enumerate() {
      if !dark {
        continue;
      }
      let is_finder = is_finder_module(x, y, matrix.len());
      let color = if request.separate_finders && is_finder { finder_fg } else { fg };
      let left = (qr_x + (margin as f32 + x as f32) * unit).round() as i32;
      let top = (qr_y + (margin as f32 + y as f32) * unit).round() as i32;
      let right = (qr_x + (margin as f32 + x as f32 + 1.0) * unit).ceil() as i32;
      let bottom = (qr_y + (margin as f32 + y as f32 + 1.0) * unit).ceil() as i32;
      draw_module(
        &mut image,
        left,
        top,
        right - left,
        bottom - top,
        color,
        if is_finder { &request.finder_shape } else { &request.module_shape },
      );
    }
  }

  if let Some(logo) = &request.logo {
    overlay_logo(&mut image, logo, qr_x, qr_y, qr_size)?;
  }

  Ok(image)
}

fn svg_module(x: f32, y: f32, size: f32, fill: String, shape: &str) -> String {
  match shape {
    "dot" | "circle" => {
      let r = size / 2.0;
      format!(r#"<circle cx="{:.2}" cy="{:.2}" r="{:.2}" fill="{fill}"/>"#, x + r, y + r, r * 0.92)
    }
    "diamond" => {
      let cx = x + size / 2.0;
      let cy = y + size / 2.0;
      format!(
        r#"<path d="M {cx:.2} {y:.2} L {:.2} {cy:.2} L {cx:.2} {:.2} L {x:.2} {cy:.2} Z" fill="{fill}"/>"#,
        x + size,
        y + size
      )
    }
    "rounded" | "soft" => {
      let radius = size * 0.28;
      format!(r#"<rect x="{x:.2}" y="{y:.2}" width="{size:.2}" height="{size:.2}" rx="{radius:.2}" fill="{fill}"/>"#)
    }
    _ => format!(r#"<rect x="{x:.2}" y="{y:.2}" width="{size:.2}" height="{size:.2}" fill="{fill}"/>"#),
  }
}

fn append_qr_svg(
  svg: &mut String,
  request: &QrRequest,
  matrix: &[Vec<bool>],
  qr_x: f32,
  qr_y: f32,
  qr_size: f32,
) -> Result<(), String> {
  let modules = matrix.len() as u32;
  let margin = request.margin.min(16);
  let total_units = modules + margin * 2;
  let unit = qr_size / total_units as f32;
  let fg = parse_color(&request.foreground)?;
  let finder_fg = parse_color(&request.finder_foreground)?;
  let card = request
    .logo
    .as_ref()
    .map(|logo| parse_color(&logo.card_color))
    .transpose()?;

  for (y, row) in matrix.iter().enumerate() {
    for (x, dark) in row.iter().enumerate() {
      if !dark {
        continue;
      }
      let is_finder = is_finder_module(x, y, matrix.len());
      let color = if request.separate_finders && is_finder { finder_fg } else { fg };
      let px = qr_x + (margin as f32 + x as f32) * unit;
      let py = qr_y + (margin as f32 + y as f32) * unit;
      svg.push_str(&svg_module(
        px,
        py,
        unit,
        rgba_to_css(color),
        if is_finder { &request.finder_shape } else { &request.module_shape },
      ));
    }
  }

  if let Some(logo) = &request.logo {
    let logo_size = (qr_size * logo.scale.clamp(0.08, 0.34)).round();
    let padding = logo.padding as f32 * (qr_size / PREVIEW_SIZE as f32).max(0.05);
    let card_size = logo_size + padding * 2.0;
    let x = qr_x + (qr_size - card_size) / 2.0;
    let y = qr_y + (qr_size - card_size) / 2.0;
    let radius = if logo.circle_card {
      card_size / 2.0
    } else {
      (logo.radius as f32 * (qr_size / PREVIEW_SIZE as f32).max(0.05)).min(card_size / 2.0)
    };
    let card_fill = card.map(rgba_to_css).unwrap_or_else(|| "#ffffff".into());
    svg.push_str(&format!(
      r#"<rect x="{x:.3}" y="{y:.3}" width="{card_size:.3}" height="{card_size:.3}" rx="{radius:.3}" fill="{card_fill}"/>"#
    ));
    svg.push_str(&format!(
      r#"<image href="{}" x="{:.3}" y="{:.3}" width="{:.3}" height="{:.3}" preserveAspectRatio="xMidYMid meet"/>"#,
      escape_attr(&logo.data_url),
      x + padding,
      y + padding,
      logo_size,
      logo_size
    ));
  }

  Ok(())
}

fn draw_module(image: &mut RgbaImage, x: i32, y: i32, width: i32, height: i32, color: Rgba<u8>, shape: &str) {
  match shape {
    "dot" | "circle" => draw_circle(image, x, y, width, height, color),
    "diamond" => draw_diamond(image, x, y, width, height, color),
    "rounded" | "soft" => draw_rounded_rect(image, x, y, width, height, color, width.max(height) / 4),
    _ => draw_rect(image, x, y, width, height, color),
  }
}

fn draw_rect(image: &mut RgbaImage, x: i32, y: i32, width: i32, height: i32, color: Rgba<u8>) {
  for py in y.max(0)..(y + height).min(image.height() as i32) {
    for px in x.max(0)..(x + width).min(image.width() as i32) {
      image.put_pixel(px as u32, py as u32, color);
    }
  }
}

fn draw_rounded_rect(image: &mut RgbaImage, x: i32, y: i32, width: i32, height: i32, color: Rgba<u8>, radius: i32) {
  let radius = radius.max(1);
  for py in y.max(0)..(y + height).min(image.height() as i32) {
    for px in x.max(0)..(x + width).min(image.width() as i32) {
      let dx = if px < x + radius {
        x + radius - px
      } else if px >= x + width - radius {
        px - (x + width - radius - 1)
      } else {
        0
      };
      let dy = if py < y + radius {
        y + radius - py
      } else if py >= y + height - radius {
        py - (y + height - radius - 1)
      } else {
        0
      };
      if dx == 0 || dy == 0 || dx * dx + dy * dy <= radius * radius {
        image.put_pixel(px as u32, py as u32, color);
      }
    }
  }
}

fn draw_circle(image: &mut RgbaImage, x: i32, y: i32, width: i32, height: i32, color: Rgba<u8>) {
  let cx = x + width / 2;
  let cy = y + height / 2;
  let rx = (width as f32 * 0.46).max(1.0);
  let ry = (height as f32 * 0.46).max(1.0);
  for py in y.max(0)..(y + height).min(image.height() as i32) {
    for px in x.max(0)..(x + width).min(image.width() as i32) {
      let dx = (px - cx) as f32 / rx;
      let dy = (py - cy) as f32 / ry;
      if dx * dx + dy * dy <= 1.0 {
        image.put_pixel(px as u32, py as u32, color);
      }
    }
  }
}

fn draw_diamond(image: &mut RgbaImage, x: i32, y: i32, width: i32, height: i32, color: Rgba<u8>) {
  let cx = x + width / 2;
  let cy = y + height / 2;
  let rx = (width / 2).max(1);
  let ry = (height / 2).max(1);
  for py in y.max(0)..(y + height).min(image.height() as i32) {
    for px in x.max(0)..(x + width).min(image.width() as i32) {
      if ((px - cx).abs() * ry + (py - cy).abs() * rx) <= rx * ry {
        image.put_pixel(px as u32, py as u32, color);
      }
    }
  }
}

fn overlay_logo(image: &mut RgbaImage, logo: &LogoRequest, qr_x: f32, qr_y: f32, qr_size: f32) -> Result<(), String> {
  let card_color = parse_color(&logo.card_color)?;
  let logo_size = (qr_size * logo.scale.clamp(0.08, 0.34)).round() as u32;
  let padding = logo.padding;
  let card_size = logo_size + padding * 2;
  let x = (qr_x + (qr_size - card_size as f32) / 2.0) as i32;
  let y = (qr_y + (qr_size - card_size as f32) / 2.0) as i32;
  let radius = if logo.circle_card {
    card_size as i32 / 2
  } else {
    (logo.radius as i32).min(card_size as i32 / 2)
  };
  draw_rounded_rect(image, x, y, card_size as i32, card_size as i32, card_color, radius);

  let bytes = decode_data_url(&logo.data_url)?;
  let source = image::load_from_memory(&bytes).map_err(|err| format!("Logo image could not be decoded: {err}"))?;
  guard_logo_dimensions(source.width(), source.height())?;
  let resized = fit_logo(source, logo_size, logo_size);
  imageops::overlay(image, &resized, (x + padding as i32) as i64, (y + padding as i32) as i64);
  Ok(())
}

fn fit_logo(source: DynamicImage, max_width: u32, max_height: u32) -> RgbaImage {
  let (width, height) = source.dimensions();
  let scale = (max_width as f32 / width as f32).min(max_height as f32 / height as f32);
  let target_width = (width as f32 * scale).round().max(1.0) as u32;
  let target_height = (height as f32 * scale).round().max(1.0) as u32;
  let resized = source.resize(target_width, target_height, imageops::FilterType::Lanczos3).to_rgba8();
  let mut canvas = RgbaImage::from_pixel(max_width, max_height, Rgba([0, 0, 0, 0]));
  let x = (max_width - target_width) / 2;
  let y = (max_height - target_height) / 2;
  imageops::overlay(&mut canvas, &resized, x as i64, y as i64);
  canvas
}

fn is_finder_module(x: usize, y: usize, width: usize) -> bool {
  let in_top_left = x < 7 && y < 7;
  let in_top_right = x >= width.saturating_sub(7) && y < 7;
  let in_bottom_left = x < 7 && y >= width.saturating_sub(7);
  in_top_left || in_top_right || in_bottom_left
}

fn make_stats(matrix: &[Vec<bool>], size: u32) -> QrStats {
  let modules = matrix.len() * matrix.len();
  let dark_modules = matrix.iter().flatten().filter(|dark| **dark).count();
  QrStats {
    modules,
    dark_modules,
    density: dark_modules as f32 / modules as f32,
    preview_size: PREVIEW_SIZE,
    estimated_png_memory_mb: (size as f32 * size as f32 * 4.0) / 1024.0 / 1024.0,
  }
}

fn warnings_for(request: &QrRequest, matrix: &[Vec<bool>], size: u32) -> Vec<String> {
  let mut warnings = Vec::new();
  let contrast = contrast_ratio(parse_color(&request.foreground).unwrap_or(Rgba([0, 0, 0, 255])), parse_color(&request.background).unwrap_or(Rgba([255, 255, 255, 255])));

  if request.margin < 4 {
    warnings.push("quiet-zone-low".into());
  }
  if contrast < 4.5 && !request.transparent_background {
    warnings.push("contrast-low".into());
  }
  if let Some(logo) = &request.logo {
    if logo.scale > 0.24 && request.error_correction != "H" {
      warnings.push("logo-needs-high-ec".into());
    }
    if logo.scale > 0.3 {
      warnings.push("logo-too-large".into());
    }
  }
  if matrix.len() > 65 {
    warnings.push("payload-dense".into());
  }
  if size > MAX_RASTER_SIDE {
    warnings.push("raster-size-high".into());
  }
  if request.frame_template != "none" && size < 512 {
    warnings.push("frame-small-output".into());
  }
  warnings
}

fn render_pdf_from_image(image: RgbaImage) -> Result<Vec<u8>, String> {
  let width = image.width();
  let height = image.height();
  let mut rgb = Vec::with_capacity((width as usize) * (height as usize) * 3);
  for pixel in image.pixels() {
    let alpha = pixel.0[3] as u16;
    let blend = |channel: u8| (((channel as u16 * alpha) + (255 * (255 - alpha))) / 255) as u8;
    rgb.extend([blend(pixel.0[0]), blend(pixel.0[1]), blend(pixel.0[2])]);
  }

  let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
  encoder.write_all(&rgb).map_err(|err| format!("PDF image compress failed: {err}"))?;
  let compressed = encoder.finish().map_err(|err| format!("PDF image finish failed: {err}"))?;
  let page_width = width as f32;
  let page_height = height as f32;
  let content = format!("q\n{page_width} 0 0 {page_height} 0 0 cm\n/Im0 Do\nQ\n");

  let objects = vec![
    b"<< /Type /Catalog /Pages 2 0 R >>".to_vec(),
    b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>".to_vec(),
    format!(
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {page_width} {page_height}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>"
    )
    .into_bytes(),
    stream_object(content.as_bytes(), None),
    stream_object(
      &compressed,
      Some(format!(
        "/Type /XObject /Subtype /Image /Width {width} /Height {height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode"
      )),
    ),
  ];

  Ok(build_pdf(objects))
}

fn stream_object(bytes: &[u8], dictionary: Option<String>) -> Vec<u8> {
  let dict = dictionary.unwrap_or_default();
  let mut object = format!("<< {dict} /Length {} >>\nstream\n", bytes.len()).into_bytes();
  object.extend_from_slice(bytes);
  object.extend_from_slice(b"\nendstream");
  object
}

fn build_pdf(objects: Vec<Vec<u8>>) -> Vec<u8> {
  let mut pdf = b"%PDF-1.4\n%\xE2\xE3\xCF\xD3\n".to_vec();
  let mut offsets = Vec::with_capacity(objects.len());
  for (index, object) in objects.iter().enumerate() {
    offsets.push(pdf.len());
    pdf.extend_from_slice(format!("{} 0 obj\n", index + 1).as_bytes());
    pdf.extend_from_slice(object);
    pdf.extend_from_slice(b"\nendobj\n");
  }
  let xref_offset = pdf.len();
  pdf.extend_from_slice(format!("xref\n0 {}\n0000000000 65535 f \n", objects.len() + 1).as_bytes());
  for offset in offsets {
    pdf.extend_from_slice(format!("{offset:010} 00000 n \n").as_bytes());
  }
  pdf.extend_from_slice(
    format!(
      "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n",
      objects.len() + 1
    )
    .as_bytes(),
  );
  pdf
}

fn draw_frame_border(image: &mut RgbaImage, pad: i32, stroke: i32, color: Rgba<u8>) {
  let size = image.width() as i32;
  draw_rect(image, pad, pad, size - pad * 2, stroke, color);
  draw_rect(image, pad, size - pad - stroke, size - pad * 2, stroke, color);
  draw_rect(image, pad, pad, stroke, size - pad * 2, color);
  draw_rect(image, size - pad - stroke, pad, stroke, size - pad * 2, color);
}

fn frame_definition(id: &str) -> Option<FrameDefinition> {
  FRAME_DEFINITIONS.iter().copied().find(|frame| frame.id == id)
}

fn strip_svg_root(svg: &str) -> Result<&str, String> {
  let start = svg.find('>').ok_or_else(|| "Frame SVG root tag is invalid".to_string())? + 1;
  let end = svg
    .rfind("</svg>")
    .ok_or_else(|| "Frame SVG closing tag is missing".to_string())?;
  Ok(&svg[start..end])
}

#[derive(Clone, Copy)]
struct PathBounds {
  min_x: f32,
  min_y: f32,
  max_x: f32,
  max_y: f32,
}

#[derive(Clone, Copy)]
enum PathToken {
  Command(char),
  Number(f32),
}

fn remove_sample_qr_paths(svg: &str, frame: FrameDefinition) -> String {
  let Some(sample_fill) = frame.sample_fill else {
    return svg.to_string();
  };
  let padding = 0.75;
  svg
    .lines()
    .filter(|line| {
      if !line.contains("<path") {
        return true;
      }
      let Some(fill) = extract_svg_attr(line, "fill") else {
        return true;
      };
      if !same_svg_color(fill, sample_fill) {
        return true;
      }
      let Some(path) = extract_svg_attr(line, "d") else {
        return true;
      };
      let Some(bounds) = path_bounds(path) else {
        return true;
      };
      !(bounds.min_x >= frame.slot.x - padding
        && bounds.min_y >= frame.slot.y - padding
        && bounds.max_x <= frame.slot.x + frame.slot.size + padding
        && bounds.max_y <= frame.slot.y + frame.slot.size + padding)
    })
    .collect::<Vec<_>>()
    .join("\n")
}

fn extract_svg_attr<'a>(line: &'a str, name: &str) -> Option<&'a str> {
  let needle = format!(r#"{name}=""#);
  let start = line.find(&needle)? + needle.len();
  let end = line[start..].find('"')?;
  Some(&line[start..start + end])
}

fn same_svg_color(a: &str, b: &str) -> bool {
  let normalize = |value: &str| value.trim().trim_matches('"').to_ascii_lowercase();
  normalize(a) == normalize(b)
}

fn path_bounds(path: &str) -> Option<PathBounds> {
  let mut tokens = Vec::new();
  let bytes = path.as_bytes();
  let mut index = 0;
  while index < bytes.len() {
    let character = bytes[index] as char;
    if character.is_ascii_alphabetic() {
      tokens.push(PathToken::Command(character));
      index += 1;
      continue;
    }
    if character.is_ascii_digit() || character == '-' || character == '+' || character == '.' {
      let start = index;
      index += 1;
      while index < bytes.len() {
        let current = bytes[index] as char;
        let previous = bytes[index - 1] as char;
        let sign_starts_new_number = (current == '-' || current == '+') && previous != 'e' && previous != 'E';
        if sign_starts_new_number || !(current.is_ascii_digit() || matches!(current, '.' | 'e' | 'E' | '-' | '+')) {
          break;
        }
        index += 1;
      }
      if let Ok(number) = path[start..index].parse::<f32>() {
        tokens.push(PathToken::Number(number));
      }
      continue;
    }
    index += 1;
  }

  let mut current_command = 'M';
  let mut cursor_x = 0.0;
  let mut cursor_y = 0.0;
  let mut bounds: Option<PathBounds> = None;
  let mut cursor = 0;

  while cursor < tokens.len() {
    if let PathToken::Command(command) = tokens[cursor] {
      current_command = command;
      cursor += 1;
    }
    match current_command {
      'M' | 'L' => {
        let Some((x, y)) = read_pair(&tokens, &mut cursor) else { break };
        cursor_x = x;
        cursor_y = y;
        include_point(&mut bounds, cursor_x, cursor_y);
      }
      'm' | 'l' => {
        let Some((x, y)) = read_pair(&tokens, &mut cursor) else { break };
        cursor_x += x;
        cursor_y += y;
        include_point(&mut bounds, cursor_x, cursor_y);
      }
      'H' => {
        let Some(x) = read_number(&tokens, &mut cursor) else { break };
        cursor_x = x;
        include_point(&mut bounds, cursor_x, cursor_y);
      }
      'h' => {
        let Some(x) = read_number(&tokens, &mut cursor) else { break };
        cursor_x += x;
        include_point(&mut bounds, cursor_x, cursor_y);
      }
      'V' => {
        let Some(y) = read_number(&tokens, &mut cursor) else { break };
        cursor_y = y;
        include_point(&mut bounds, cursor_x, cursor_y);
      }
      'v' => {
        let Some(y) = read_number(&tokens, &mut cursor) else { break };
        cursor_y += y;
        include_point(&mut bounds, cursor_x, cursor_y);
      }
      'C' => {
        for _ in 0..3 {
          let Some((x, y)) = read_pair(&tokens, &mut cursor) else { break };
          cursor_x = x;
          cursor_y = y;
          include_point(&mut bounds, cursor_x, cursor_y);
        }
      }
      'c' => {
        for _ in 0..3 {
          let Some((x, y)) = read_pair(&tokens, &mut cursor) else { break };
          cursor_x += x;
          cursor_y += y;
          include_point(&mut bounds, cursor_x, cursor_y);
        }
      }
      'Z' | 'z' => {}
      _ => cursor += 1,
    }
  }
  bounds
}

fn read_pair(tokens: &[PathToken], cursor: &mut usize) -> Option<(f32, f32)> {
  Some((read_number(tokens, cursor)?, read_number(tokens, cursor)?))
}

fn read_number(tokens: &[PathToken], cursor: &mut usize) -> Option<f32> {
  match tokens.get(*cursor).copied()? {
    PathToken::Number(number) => {
      *cursor += 1;
      Some(number)
    }
    PathToken::Command(_) => None,
  }
}

fn include_point(bounds: &mut Option<PathBounds>, x: f32, y: f32) {
  match bounds {
    Some(bounds) => {
      bounds.min_x = bounds.min_x.min(x);
      bounds.min_y = bounds.min_y.min(y);
      bounds.max_x = bounds.max_x.max(x);
      bounds.max_y = bounds.max_y.max(y);
    }
    None => {
      *bounds = Some(PathBounds {
        min_x: x,
        min_y: y,
        max_x: x,
        max_y: y,
      });
    }
  }
}

fn colorize_frame_svg(svg: &str, request: &QrRequest, frame: FrameDefinition) -> String {
  let accent = request.frame_accent.trim();
  let accent = if accent.is_empty() { "#38bdf8" } else { accent };
  let mut output = svg.to_string();
  for target in frame.color_targets {
    output = output.replace(&format!(r#"fill="{target}""#), &format!(r#"fill="{accent}""#));
    output = output.replace(&format!(r#"stroke="{target}""#), &format!(r#"stroke="{accent}""#));
  }
  output
}

fn rasterize_svg(svg: &str) -> Result<RgbaImage, String> {
  let options = usvg::Options::default();
  let tree = usvg::Tree::from_str(svg, &options)
    .map_err(|err| format!("Frame SVG parse edilemedi: {err}"))?;
  let size = tree.size().to_int_size();
  let mut pixmap = tiny_skia::Pixmap::new(size.width(), size.height())
    .ok_or_else(|| "SVG raster pixmap olusturulamadi.".to_string())?;
  resvg::render(&tree, tiny_skia::Transform::identity(), &mut pixmap.as_mut());
  RgbaImage::from_raw(size.width(), size.height(), pixmap.take())
    .ok_or_else(|| "SVG raster verisi RGBA gorsele donusturulemedi.".to_string())
}

fn write_bytes(path: &Path, bytes: &[u8]) -> Result<(), String> {
  fs::write(path, bytes).map_err(|err| format!("Dosya yazilamadi ({}): {err}", path.display()))
}

fn unique_path(folder: &Path, file_name: &str) -> PathBuf {
  let clean = sanitize_file_name(file_name);
  let candidate = folder.join(&clean);
  if !candidate.exists() {
    return candidate;
  }
  let stem = candidate.file_stem().and_then(|item| item.to_str()).unwrap_or("qrstudio-export");
  let extension = candidate.extension().and_then(|item| item.to_str()).unwrap_or("");
  for index in 2..10_000 {
    let name = if extension.is_empty() {
      format!("{stem}-{index}")
    } else {
      format!("{stem}-{index}.{extension}")
    };
    let path = folder.join(name);
    if !path.exists() {
      return path;
    }
  }
  folder.join(clean)
}

fn sanitize_file_name(file_name: &str) -> String {
  let sanitized: String = file_name
    .chars()
    .map(|character| match character {
      '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '-',
      character if character.is_control() => '-',
      character => character,
    })
    .collect();
  if sanitized.trim().is_empty() {
    "qrstudio-export.png".into()
  } else {
    sanitized
  }
}

fn file_extension(file_name: &str) -> &str {
  file_name.rsplit_once('.').map(|(_, extension)| extension).unwrap_or("png")
}

fn filter_label(mime_type: &str) -> &str {
  match mime_type {
    "image/svg+xml" => "SVG",
    "image/jpeg" => "JPG",
    "image/webp" => "WebP",
    "application/pdf" => "PDF",
    _ => "PNG",
  }
}

fn guard_raster_size(size: u32) -> Result<(), String> {
  let pixels = size as u64 * size as u64;
  if size > MAX_RASTER_SIDE || pixels > MAX_RASTER_PIXELS {
    return Err(format!("ERR_RASTER_TOO_LARGE:{size}:{MAX_RASTER_SIDE}:{}", MAX_RASTER_PIXELS / 1_000_000));
  }
  Ok(())
}

fn parse_color(input: &str) -> Result<Rgba<u8>, String> {
  let value = input.trim().trim_start_matches('#');
  let parse = |range: std::ops::Range<usize>| u8::from_str_radix(&value[range], 16).map_err(|_| format!("Invalid color: {input}"));
  match value.len() {
    6 => Ok(Rgba([parse(0..2)?, parse(2..4)?, parse(4..6)?, 255])),
    8 => Ok(Rgba([parse(0..2)?, parse(2..4)?, parse(4..6)?, parse(6..8)?])),
    _ => Err(format!("Invalid color: {input}")),
  }
}

fn rgba_to_css(color: Rgba<u8>) -> String {
  if color.0[3] == 255 {
    format!("#{:02x}{:02x}{:02x}", color.0[0], color.0[1], color.0[2])
  } else {
    format!("rgba({}, {}, {}, {:.3})", color.0[0], color.0[1], color.0[2], color.0[3] as f32 / 255.0)
  }
}

fn contrast_ratio(a: Rgba<u8>, b: Rgba<u8>) -> f32 {
  let la = luminance(a);
  let lb = luminance(b);
  let (lighter, darker) = if la > lb { (la, lb) } else { (lb, la) };
  (lighter + 0.05) / (darker + 0.05)
}

fn luminance(color: Rgba<u8>) -> f32 {
  let channel = |v: u8| {
    let n = v as f32 / 255.0;
    if n <= 0.03928 { n / 12.92 } else { ((n + 0.055) / 1.055).powf(2.4) }
  };
  0.2126 * channel(color.0[0]) + 0.7152 * channel(color.0[1]) + 0.0722 * channel(color.0[2])
}

fn decode_data_url(data_url: &str) -> Result<Vec<u8>, String> {
  let encoded = data_url
    .split_once(',')
    .map(|(_, data)| data)
    .ok_or_else(|| "Logo data URL is invalid".to_string())?;
  general_purpose::STANDARD
    .decode(encoded)
    .map_err(|err| format!("Logo base64 could not be decoded: {err}"))
}

fn guard_logo_data_url(data_url: &str) -> Result<(), String> {
  let Some((header, encoded)) = data_url.split_once(',') else {
    return Err("ERR_LOGO_DATA_URL".into());
  };
  if header.contains("image/svg") {
    return Err("ERR_LOGO_SVG_UNSUPPORTED".into());
  }
  let estimated_bytes = encoded.len().saturating_mul(3) / 4;
  if estimated_bytes > MAX_LOGO_BYTES {
    return Err(format!("ERR_LOGO_TOO_LARGE:{}", MAX_LOGO_BYTES / 1024 / 1024));
  }
  Ok(())
}

fn guard_logo_dimensions(width: u32, height: u32) -> Result<(), String> {
  let pixels = width as u64 * height as u64;
  if width == 0 || height == 0 {
    return Err("ERR_LOGO_EMPTY".into());
  }
  if pixels > MAX_LOGO_PIXELS {
    return Err(format!("ERR_LOGO_PIXELS:{}", MAX_LOGO_PIXELS / 1_000_000));
  }
  Ok(())
}

fn escape_attr(value: &str) -> String {
  value.replace('&', "&amp;").replace('"', "&quot;").replace('<', "&lt;").replace('>', "&gt;")
}

fn escape_text(value: &str) -> String {
  value.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
}

fn default_frame_text(template: &str) -> &str {
  match template {
    "wifi" => "Wi-Fi icin tara",
    "menu" => "Menuyu ac",
    "coupon" => "Firsati yakala",
    "social" => "Bizi takip et",
    _ => "Taramak icin kamerani ac",
  }
}

fn with_extension(name: &str, extension: &str) -> String {
  let clean = name.trim().trim_end_matches('.');
  let base = if clean.is_empty() { "qrstudio-export" } else { clean };
  let without_ext = base.rsplit_once('.').map(|(stem, _)| stem).unwrap_or(base);
  format!("{without_ext}.{extension}")
}
