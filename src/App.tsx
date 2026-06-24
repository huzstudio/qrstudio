import { invoke } from '@tauri-apps/api/core'
import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Contact,
  Download,
  FileJson,
  ImagePlus,
  Languages,
  Link,
  Mail,
  MapPin,
  Palette,
  Phone,
  QrCode,
  RefreshCw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Type,
  Upload,
  Wifi,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type Tab = 'content' | 'design' | 'logo' | 'export' | 'project'
type ContentKind = 'url' | 'text' | 'wifi' | 'email' | 'phone' | 'sms' | 'vcard' | 'event' | 'location'
type ErrorCorrection = 'L' | 'M' | 'Q' | 'H'
type ExportFormat = 'png' | 'jpg' | 'webp' | 'svg' | 'pdf'
type Language = 'tr' | 'en' | 'de' | 'es' | 'da' | 'no' | 'it' | 'ru'
type TabLabelKey = 'tabContent' | 'tabDesign' | 'tabLogo' | 'tabExport' | 'tabProject'
type FrameTemplate =
  | 'none'
  | 'frame-01'
  | 'frame-02'
  | 'frame-03'
  | 'frame-04'
  | 'frame-05'
  | 'frame-06'
  | 'frame-07'
  | 'frame-08'
  | 'frame-09'
  | 'frame-10'
  | 'frame-11'

interface LogoState {
  dataUrl: string
  name: string
  scale: number
  padding: number
  cardColor: string
  radius: number
  circleCard: boolean
}

interface StudioState {
  language: Language
  contentKind: ContentKind
  url: string
  text: string
  wifiSsid: string
  wifiPassword: string
  wifiEncryption: 'WPA' | 'WEP' | 'nopass'
  wifiHidden: boolean
  emailTo: string
  emailSubject: string
  emailBody: string
  phone: string
  smsBody: string
  vcardName: string
  vcardOrg: string
  vcardTitle: string
  vcardPhone: string
  vcardEmail: string
  vcardUrl: string
  eventTitle: string
  eventStart: string
  eventEnd: string
  eventLocation: string
  locationLat: string
  locationLng: string
  errorCorrection: ErrorCorrection
  margin: number
  moduleShape: 'square' | 'rounded' | 'dot' | 'diamond'
  finderShape: 'square' | 'rounded' | 'circle'
  foreground: string
  background: string
  finderForeground: string
  separateFinders: boolean
  transparentBackground: boolean
  frameTemplate: FrameTemplate
  frameText: string
  frameAccent: string
  logo: LogoState | null
  exportFormat: ExportFormat
  exportSizes: number[]
  customExportSize: number
  fileName: string
}

interface PreviewResponse {
  svg: string
  stats: {
    modules: number
    darkModules: number
    density: number
    previewSize: number
    estimatedPngMemoryMb: number
  }
  warnings: string[]
}

interface ExportResponse {
  fileName: string
  mimeType: string
  base64Data: string
  warnings: string[]
}

interface SavedExportResponse {
  paths: string[]
  warnings: string[]
}

interface DecodeTestResponse {
  success: boolean
  decodedText: string | null
  message: string
  warnings: string[]
}

interface BatchRow {
  id: string
  name: string
  payload: string
}

const MAX_LOGO_FILE_BYTES = 5 * 1024 * 1024
const MAX_CSV_FILE_BYTES = 2 * 1024 * 1024
const MAX_CSV_ROWS = 1000
const MAX_BATCH_EXPORTS = 250

const tabs: Array<{ id: Tab; labelKey: TabLabelKey; icon: typeof Type }> = [
  { id: 'content', labelKey: 'tabContent', icon: Type },
  { id: 'design', labelKey: 'tabDesign', icon: Palette },
  { id: 'logo', labelKey: 'tabLogo', icon: ImagePlus },
  { id: 'export', labelKey: 'tabExport', icon: Download },
  { id: 'project', labelKey: 'tabProject', icon: FileJson },
]

const enAppText = {
  tabContent: 'Content',
  tabDesign: 'Design',
  tabLogo: 'Logo',
  tabExport: 'Export',
  tabProject: 'Project',
  engine: 'Rust render engine',
  preview: 'Preview',
  download: 'Download',
  preparing: 'Preparing',
  livePreview: 'Live Preview',
  canvasTitle: 'Fixed-size QR canvas',
  previewLoading: 'Preparing preview',
  rustPreparing: 'Rust is preparing',
  language: 'Language',
  contentType: 'Content Type',
  qrStyle: 'QR Style',
  themes: 'Themes',
  frameTemplate: 'Frame / Template',
  logoCardCircle: 'Circular logo card',
  statusReady: 'Ready',
  statusBrowserFallback: 'Browser preview: run with Tauri for the full engine',
  statusPreviewUpdated: 'Preview updated',
  statusPreparingExports: (count: number) => `${count} export${count === 1 ? '' : 's'} preparing`,
  statusFilesSaved: (count: number, path: string) => `${count} file${count === 1 ? '' : 's'} saved: ${path}`,
  statusDecodeRunning: 'Decode test is running',
  statusCsvReady: (count: number) => `${count} CSV row${count === 1 ? '' : 's'} ready`,
  statusUploadCsvFirst: 'Upload a CSV first',
  statusBatchSaved: (count: number) => `${count} batch file${count === 1 ? '' : 's'} saved`,
  statusProjectSaved: 'Project file prepared',
  statusProjectOpened: 'Project opened',
  errDecodeDesktop: 'Tauri desktop mode is required for decode testing',
  errBatchDesktop: 'Tauri desktop mode is required for CSV batch export',
  errLogoImage: 'Choose an image file for the logo',
  errLogoTooLarge: (maxMb: number) => `Logo must be ${maxMb} MB or smaller`,
  errLogoPixelsTooLarge: (maxMp: number) => `Logo resolution is too large. Limit: ${maxMp} MP.`,
  errLogoSvgUnsupported: 'SVG logos are not supported yet. Use PNG, JPG, or WebP.',
  errCsvTooLarge: (maxMb: number) => `CSV file must be ${maxMb} MB or smaller`,
  errCsvTooManyRows: (maxRows: number) => `CSV can contain up to ${maxRows} rows`,
  errBatchTooLarge: (maxFiles: number) => `Batch export can create up to ${maxFiles} files at once`,
  errExportEmpty: 'Export list is empty',
  errSaveCancelled: 'Save was cancelled',
  errFolderCancelled: 'Folder selection was cancelled',
  errRasterTooLarge: (size: string, maxSide: string, maxMp: string) => `Raster export is too large (${size}x${size}). Limit: ${maxSide}px side or ${maxMp} MP. Use SVG or choose a smaller size.`,
  errInvalidProject: 'Invalid project file',
  errEmptyCsv: 'CSV is empty',
  browserFallbackWarning: 'Run in Tauri desktop mode for full QR rendering.',
  logoTitle: 'Logo',
  csvBatchTitle: 'CSV Batch',
  projectTitle: 'Project',
  density: 'density',
  qualityControl: 'Quality Control',
  noCriticalRisk: 'No critical risk detected.',
  technicalSummary: 'Technical Summary',
  modules: 'Modules',
  darkModules: 'Dark modules',
  pngMemoryEstimate: 'PNG memory estimate',
  payloadCount: (count: number) => `${count} character payload`,
  contentUrl: 'URL',
  contentText: 'Text',
  contentWifi: 'Wi-Fi',
  contentEmail: 'Email',
  contentPhone: 'Phone',
  contentSms: 'SMS',
  contentVcard: 'vCard',
  contentEvent: 'Event',
  contentLocation: 'Location',
  fieldText: 'Text',
  password: 'Password',
  encryption: 'Encryption',
  noPassword: 'No password',
  hiddenNetwork: 'Hidden network',
  recipient: 'Recipient',
  subject: 'Subject',
  message: 'Message',
  fullName: 'Full name',
  company: 'Company',
  title: 'Title',
  start: 'Start',
  end: 'End',
  latitude: 'Latitude',
  longitude: 'Longitude',
  payload: 'Payload',
  qrColor: 'QR color',
  background: 'Background',
  transparentBackground: 'Transparent background',
  moduleShape: 'Module shape',
  finderShape: 'Finder shape',
  separateFinderColor: 'Use separate finder color',
  finderColor: 'Finder color',
  errorCorrection: 'Error correction',
  quietZone: 'Quiet zone',
  frame: 'Frame',
  none: 'None',
  frameColor: 'Frame color',
  logoSelect: 'Choose logo',
  logoFileHint: 'PNG, JPG or WebP file',
  selectedLogoAlt: 'Selected logo',
  removeLogo: 'Remove logo',
  logoScale: 'Logo scale',
  logoPadding: 'Logo padding',
  cardRadius: 'Card radius',
  logoCardColor: 'Logo card color',
  exportTitle: 'Export',
  format: 'Format',
  fileName: 'File name',
  customSize: 'Custom size',
  add: 'Add',
  exportNote: 'A Save dialog opens for a single file; folder selection opens for multiple sizes or CSV batch.',
  decodeTest: 'Run QR decode test',
  decodeSuccess: 'Decode test passed.',
  decodeFailed: 'Decode test failed.',
  filesDownload: (count: number) => `Download ${count} file${count === 1 ? '' : 's'}`,
  csvUpload: 'Upload CSV',
  csvSummaryEmpty: 'CSV columns: name,payload or first column as payload',
  csvSummaryReady: (count: number) => `${count} row${count === 1 ? '' : 's'} ready`,
  csvBatchExport: 'CSV batch export',
  saveProject: 'Save project as JSON',
  openProject: 'Open JSON project',
  resetDefaults: 'Reset to defaults',
  content: 'Content',
  export: 'Export',
  available: 'Yes',
  unavailable: 'No',
  warnings: {
    'quiet-zone-low': 'Quiet zone is below 4 modules. Some cameras may struggle to scan it.',
    'contrast-low': 'Foreground/background contrast is low. Use darker or lighter colors.',
    'logo-needs-high-ec': 'Large logos are safer with H error correction.',
    'logo-too-large': 'The logo covers too much of the QR center and may reduce scan reliability.',
    'payload-dense': 'Payload is dense. A short URL or less data will produce a cleaner QR.',
    'raster-size-high': 'This size is above the raster export limit; SVG export is more suitable.',
    'frame-small-output': 'Frame text and borders may be too small below 512px.',
    'pdf-size-clamped': 'PDF rendering was limited to 4096px and embedded at high quality.',
  },
  defaults: {
    text: 'Comprehensive QR code generated with QR Studio.',
    emailSubject: 'Hello',
    emailBody: 'QR Studio test message',
    smsBody: 'Hello',
    eventLocation: 'Istanbul',
    fileName: 'qrstudio-export',
  },
}

type AppText = typeof enAppText

const appLanguages: Array<{ id: Language; label: string }> = [
  { id: 'en', label: 'English' },
  { id: 'tr', label: 'Türkçe' },
  { id: 'de', label: 'Deutsch' },
  { id: 'es', label: 'Español' },
  { id: 'da', label: 'Dansk' },
  { id: 'no', label: 'Norsk' },
  { id: 'it', label: 'Italiano' },
  { id: 'ru', label: 'Русский' },
]

const appText: Record<Language, AppText> = {
  en: enAppText,
  tr: {
    ...enAppText,
    tabContent: 'İçerik',
    tabDesign: 'Tasarım',
    tabExport: 'Dışa Aktar',
    engine: 'Rust render motoru',
    preview: 'Önizle',
    download: 'İndir',
    preparing: 'Hazırlanıyor',
    livePreview: 'Canlı Önizleme',
    canvasTitle: 'Sabit boyutlu QR tuvali',
    previewLoading: 'Önizleme hazırlanıyor',
    rustPreparing: 'Rust hazırlanıyor',
    language: 'Dil',
    contentType: 'İçerik Tipi',
    qrStyle: 'QR Stili',
    themes: 'Hazır Temalar',
    logoCardCircle: 'Logo kartı daire',
    statusReady: 'Hazır',
    statusBrowserFallback: 'Tarayıcı önizlemesi: tam motor için Tauri ile çalıştır',
    statusPreviewUpdated: 'Önizleme güncellendi',
    statusPreparingExports: (count) => `${count} çıktı hazırlanıyor`,
    statusFilesSaved: (count, path) => `${count} dosya kaydedildi: ${path}`,
    statusDecodeRunning: 'Decode testi çalışıyor',
    statusCsvReady: (count) => `${count} CSV satırı hazır`,
    statusUploadCsvFirst: 'Önce CSV yükle',
    statusBatchSaved: (count) => `${count} batch dosyası kaydedildi`,
    statusProjectSaved: 'Proje dosyası hazırlandı',
    statusProjectOpened: 'Proje açıldı',
    errDecodeDesktop: 'Decode testi için Tauri desktop modu gerekli',
    errBatchDesktop: 'CSV batch export için Tauri desktop modu gerekli',
    errLogoImage: 'Logo için görsel dosyası seç',
    errLogoTooLarge: (maxMb) => `Logo ${maxMb} MB veya daha küçük olmalı`,
    errLogoPixelsTooLarge: (maxMp) => `Logo çözünürlüğü çok büyük. Limit: ${maxMp} MP.`,
    errLogoSvgUnsupported: 'SVG logo henüz desteklenmiyor. PNG, JPG veya WebP kullan.',
    errCsvTooLarge: (maxMb) => `CSV dosyası ${maxMb} MB veya daha küçük olmalı`,
    errCsvTooManyRows: (maxRows) => `CSV en fazla ${maxRows} satır içerebilir`,
    errBatchTooLarge: (maxFiles) => `Batch export tek seferde en fazla ${maxFiles} dosya oluşturabilir`,
    errExportEmpty: 'Export listesi boş',
    errSaveCancelled: 'Kaydetme iptal edildi',
    errFolderCancelled: 'Klasör seçimi iptal edildi',
    errRasterTooLarge: (size, maxSide, maxMp) => `Raster export çok büyük (${size}x${size}). Limit: ${maxSide}px kenar veya ${maxMp} MP. SVG kullan ya da daha küçük boyut seç.`,
    errInvalidProject: 'Geçersiz proje dosyası',
    errEmptyCsv: 'CSV boş',
    browserFallbackWarning: 'Tam QR render için Tauri desktop modunda çalıştır.',
    logoTitle: 'Logo',
    csvBatchTitle: 'CSV Batch',
    projectTitle: 'Proje',
    density: 'doluluk',
    qualityControl: 'Kalite Kontrol',
    noCriticalRisk: 'Kritik bir risk görünmüyor.',
    technicalSummary: 'Teknik Özet',
    modules: 'Modül',
    darkModules: 'Koyu modül',
    pngMemoryEstimate: 'PNG bellek tahmini',
    payloadCount: (count) => `${count} karakter payload`,
    contentText: 'Metin',
    contentEmail: 'E-posta',
    contentPhone: 'Telefon',
    contentEvent: 'Etkinlik',
    contentLocation: 'Konum',
    fieldText: 'Metin',
    password: 'Şifre',
    encryption: 'Şifreleme',
    noPassword: 'Şifresiz',
    hiddenNetwork: 'Gizli ağ',
    recipient: 'Alıcı',
    subject: 'Konu',
    message: 'Mesaj',
    fullName: 'Ad Soyad',
    company: 'Şirket',
    title: 'Başlık',
    start: 'Başlangıç',
    end: 'Bitiş',
    qrColor: 'QR Rengi',
    background: 'Arka Plan',
    transparentBackground: 'Şeffaf arka plan',
    moduleShape: 'Modül şekli',
    finderShape: 'Finder şekli',
    separateFinderColor: 'Finder rengi ayrı olsun',
    finderColor: 'Finder rengi',
    none: 'Yok',
    frameColor: 'Frame rengi',
    logoSelect: 'Logo seç',
    logoFileHint: 'PNG, JPG veya WebP dosyası',
    selectedLogoAlt: 'Seçilen logo',
    removeLogo: 'Logoyu kaldır',
    cardRadius: 'Kart radius',
    logoCardColor: 'Logo kart rengi',
    exportTitle: 'Dışa Aktar',
    fileName: 'Dosya adı',
    customSize: 'Özel boyut',
    add: 'Ekle',
    exportNote: 'Tek dosyada Kaydet penceresi, çoklu boyut veya CSV batch için klasör seçimi açılır.',
    decodeTest: 'QR decode testi yap',
    decodeSuccess: 'Decode testi başarılı.',
    decodeFailed: 'Decode testi başarısız.',
    filesDownload: (count) => `${count} dosya indir`,
    csvUpload: 'CSV yükle',
    csvSummaryEmpty: 'CSV kolonları: name,payload veya ilk kolon payload',
    csvSummaryReady: (count) => `${count} satır hazır`,
    csvBatchExport: 'CSV toplu export',
    saveProject: 'Projeyi JSON olarak kaydet',
    openProject: 'JSON projesi aç',
    resetDefaults: 'Varsayılana dön',
    content: 'İçerik',
    available: 'Var',
    unavailable: 'Yok',
    warnings: {
      'quiet-zone-low': 'Quiet zone 4 modülden düşük. Bazı kameralar QR kodu okumakta zorlanabilir.',
      'contrast-low': 'Ön plan ve arka plan kontrastı düşük. Daha koyu veya açık renkler kullan.',
      'logo-needs-high-ec': 'Büyük logolar için H error correction daha güvenlidir.',
      'logo-too-large': 'Logo QR merkezini fazla kaplıyor ve taranabilirliği düşürebilir.',
      'payload-dense': 'Payload yoğun. Kısa URL veya daha az veri daha temiz QR üretir.',
      'raster-size-high': 'Bu boyut raster export limitinin üstünde; SVG export daha uygundur.',
      'frame-small-output': '512px altı çıktılarda frame metni ve kenarlıklar çok küçük kalabilir.',
      'pdf-size-clamped': 'PDF render 4096px ile sınırlandı ve yüksek kaliteyle gömüldü.',
    },
    defaults: {
      text: 'QR Studio ile üretilen kapsamlı QR kodu.',
      emailSubject: 'Merhaba',
      emailBody: 'QR Studio test mesajı',
      smsBody: 'Merhaba',
      eventLocation: 'İstanbul',
      fileName: 'qrstudio-cikti',
    },
  },
  de: {
    ...enAppText,
    tabContent: 'Inhalt', tabDesign: 'Design', tabExport: 'Export', tabProject: 'Projekt',
    engine: 'Rust-Render-Engine', preview: 'Vorschau', download: 'Herunterladen', preparing: 'Wird vorbereitet',
    livePreview: 'Live-Vorschau', canvasTitle: 'QR-Leinwand mit fester Größe', previewLoading: 'Vorschau wird vorbereitet',
    rustPreparing: 'Rust wird vorbereitet', language: 'Sprache', contentType: 'Inhaltstyp', qrStyle: 'QR-Stil', themes: 'Vorlagen',
    logoCardCircle: 'Runde Logo-Karte', statusReady: 'Bereit', statusBrowserFallback: 'Browser-Vorschau: Für den vollständigen Motor mit Tauri starten',
    statusPreviewUpdated: 'Vorschau aktualisiert', statusPreparingExports: (count) => `${count} Export${count === 1 ? '' : 'e'} wird vorbereitet`,
    statusFilesSaved: (count, path) => `${count} Datei${count === 1 ? '' : 'en'} gespeichert: ${path}`, statusDecodeRunning: 'Decode-Test läuft',
    statusCsvReady: (count) => `${count} CSV-Zeile${count === 1 ? '' : 'n'} bereit`, statusUploadCsvFirst: 'Zuerst CSV hochladen',
    statusBatchSaved: (count) => `${count} Batch-Datei${count === 1 ? '' : 'en'} gespeichert`, statusProjectSaved: 'Projektdatei vorbereitet',
    statusProjectOpened: 'Projekt geöffnet', errDecodeDesktop: 'Für den Decode-Test ist der Tauri-Desktopmodus erforderlich',
    errBatchDesktop: 'Für CSV-Batch-Export ist der Tauri-Desktopmodus erforderlich', errLogoImage: 'Wähle eine Bilddatei für das Logo',
    errInvalidProject: 'Ungültige Projektdatei', errEmptyCsv: 'CSV ist leer', browserFallbackWarning: 'Für vollständiges QR-Rendering im Tauri-Desktopmodus starten.',
    density: 'Füllung', qualityControl: 'Qualitätskontrolle', noCriticalRisk: 'Kein kritisches Risiko erkannt.', technicalSummary: 'Technische Übersicht',
    modules: 'Module', darkModules: 'Dunkle Module', pngMemoryEstimate: 'PNG-Speicherschätzung', payloadCount: (count) => `${count} Zeichen Payload`,
    contentText: 'Text', contentEmail: 'E-Mail', contentPhone: 'Telefon', contentEvent: 'Termin', contentLocation: 'Standort',
    fieldText: 'Text', password: 'Passwort', encryption: 'Verschlüsselung', noPassword: 'Kein Passwort', hiddenNetwork: 'Verstecktes Netzwerk',
    recipient: 'Empfänger', subject: 'Betreff', message: 'Nachricht', fullName: 'Vollständiger Name', company: 'Firma', title: 'Titel',
    start: 'Start', end: 'Ende', payload: 'Payload', qrColor: 'QR-Farbe', background: 'Hintergrund', transparentBackground: 'Transparenter Hintergrund',
    moduleShape: 'Modulform', finderShape: 'Finder-Form', separateFinderColor: 'Separate Finder-Farbe verwenden', finderColor: 'Finder-Farbe',
    none: 'Keine', frameColor: 'Frame-Farbe', logoSelect: 'Logo wählen', logoFileHint: 'PNG-, JPG- oder WebP-Datei',
    selectedLogoAlt: 'Ausgewähltes Logo', removeLogo: 'Logo entfernen', logoScale: 'Logo-Skalierung', logoPadding: 'Logo-Abstand',
    cardRadius: 'Kartenradius', logoCardColor: 'Logo-Kartenfarbe', exportTitle: 'Export', fileName: 'Dateiname', customSize: 'Eigene Größe',
    add: 'Hinzufügen', exportNote: 'Bei einer Datei öffnet sich Speichern; bei mehreren Größen oder CSV-Batch die Ordnerauswahl.',
    decodeTest: 'QR-Decode-Test ausführen', decodeSuccess: 'Decode-Test erfolgreich.', decodeFailed: 'Decode-Test fehlgeschlagen.', filesDownload: (count) => `${count} Datei${count === 1 ? '' : 'en'} herunterladen`,
    csvUpload: 'CSV hochladen', csvSummaryEmpty: 'CSV-Spalten: name,payload oder erste Spalte als Payload',
    csvSummaryReady: (count) => `${count} Zeile${count === 1 ? '' : 'n'} bereit`, csvBatchExport: 'CSV-Batch-Export',
    saveProject: 'Projekt als JSON speichern', openProject: 'JSON-Projekt öffnen', resetDefaults: 'Auf Standard zurücksetzen',
    content: 'Inhalt', available: 'Ja', unavailable: 'Nein',
    defaults: { text: 'Umfassender QR-Code, erstellt mit QR Studio.', emailSubject: 'Hallo', emailBody: 'QR Studio Testnachricht', smsBody: 'Hallo', eventLocation: 'Istanbul', fileName: 'qrstudio-export' },
  },
  es: {
    ...enAppText,
    tabContent: 'Contenido', tabDesign: 'Diseño', tabExport: 'Exportar', tabProject: 'Proyecto', engine: 'Motor de render Rust',
    preview: 'Vista previa', download: 'Descargar', preparing: 'Preparando', livePreview: 'Vista previa en vivo',
    canvasTitle: 'Lienzo QR de tamaño fijo', previewLoading: 'Preparando vista previa', rustPreparing: 'Rust se está preparando',
    language: 'Idioma', contentType: 'Tipo de contenido', qrStyle: 'Estilo QR', themes: 'Temas', logoCardCircle: 'Tarjeta de logo circular',
    statusReady: 'Listo', statusBrowserFallback: 'Vista previa del navegador: ejecuta con Tauri para el motor completo',
    statusPreviewUpdated: 'Vista previa actualizada', statusPreparingExports: (count) => `${count} exportación${count === 1 ? '' : 'es'} preparándose`,
    statusFilesSaved: (count, path) => `${count} archivo${count === 1 ? '' : 's'} guardado${count === 1 ? '' : 's'}: ${path}`,
    statusDecodeRunning: 'Prueba de decodificación en curso', statusCsvReady: (count) => `${count} fila${count === 1 ? '' : 's'} CSV lista${count === 1 ? '' : 's'}`,
    statusUploadCsvFirst: 'Sube un CSV primero', statusBatchSaved: (count) => `${count} archivo${count === 1 ? '' : 's'} batch guardado${count === 1 ? '' : 's'}`,
    statusProjectSaved: 'Archivo de proyecto preparado', statusProjectOpened: 'Proyecto abierto', errDecodeDesktop: 'Se requiere modo Tauri desktop para la prueba decode',
    errBatchDesktop: 'Se requiere modo Tauri desktop para exportar CSV batch', errLogoImage: 'Elige una imagen para el logo', errInvalidProject: 'Archivo de proyecto inválido',
    errEmptyCsv: 'CSV vacío', browserFallbackWarning: 'Ejecuta en modo Tauri desktop para el render QR completo.', density: 'ocupación',
    qualityControl: 'Control de calidad', noCriticalRisk: 'No se detecta riesgo crítico.', technicalSummary: 'Resumen técnico',
    modules: 'Módulos', darkModules: 'Módulos oscuros', pngMemoryEstimate: 'Memoria PNG estimada', payloadCount: (count) => `${count} caracteres payload`,
    contentText: 'Texto', contentEmail: 'Correo', contentPhone: 'Teléfono', contentEvent: 'Evento', contentLocation: 'Ubicación',
    fieldText: 'Texto', password: 'Contraseña', encryption: 'Cifrado', noPassword: 'Sin contraseña', hiddenNetwork: 'Red oculta',
    recipient: 'Destinatario', subject: 'Asunto', message: 'Mensaje', fullName: 'Nombre completo', company: 'Empresa', title: 'Título',
    start: 'Inicio', end: 'Fin', qrColor: 'Color QR', background: 'Fondo', transparentBackground: 'Fondo transparente', moduleShape: 'Forma del módulo',
    finderShape: 'Forma del finder', separateFinderColor: 'Usar color separado para finder', finderColor: 'Color del finder', none: 'Ninguno',
    frameColor: 'Color del frame', logoSelect: 'Elegir logo', logoFileHint: 'Archivo PNG, JPG o WebP', selectedLogoAlt: 'Logo seleccionado',
    removeLogo: 'Quitar logo', logoScale: 'Escala del logo', logoPadding: 'Padding del logo', cardRadius: 'Radio de tarjeta', logoCardColor: 'Color de tarjeta del logo',
    exportTitle: 'Exportar', fileName: 'Nombre de archivo', customSize: 'Tamaño personalizado', add: 'Añadir',
    exportNote: 'Para un archivo se abre Guardar; para varios tamaños o CSV batch se abre selección de carpeta.', decodeTest: 'Ejecutar prueba decode QR', decodeSuccess: 'Prueba decode correcta.', decodeFailed: 'Prueba decode fallida.',
    filesDownload: (count) => `Descargar ${count} archivo${count === 1 ? '' : 's'}`, csvUpload: 'Subir CSV',
    csvSummaryEmpty: 'Columnas CSV: name,payload o primera columna como payload', csvSummaryReady: (count) => `${count} fila${count === 1 ? '' : 's'} lista${count === 1 ? '' : 's'}`,
    csvBatchExport: 'Exportación CSV batch', saveProject: 'Guardar proyecto como JSON', openProject: 'Abrir proyecto JSON', resetDefaults: 'Restablecer valores',
    content: 'Contenido', available: 'Sí', unavailable: 'No',
    defaults: { text: 'Código QR completo generado con QR Studio.', emailSubject: 'Hola', emailBody: 'Mensaje de prueba de QR Studio', smsBody: 'Hola', eventLocation: 'Estambul', fileName: 'qrstudio-export' },
  },
  da: {
    ...enAppText,
    tabContent: 'Indhold', tabDesign: 'Design', tabExport: 'Eksport', tabProject: 'Projekt',
    engine: 'Rust render-motor', preview: 'Forhåndsvis', download: 'Download', preparing: 'Forbereder',
    livePreview: 'Live forhåndsvisning', canvasTitle: 'QR-lærred med fast størrelse', previewLoading: 'Forbereder forhåndsvisning',
    rustPreparing: 'Rust forberedes', language: 'Sprog', contentType: 'Indholdstype', qrStyle: 'QR-stil', themes: 'Temaer',
    logoCardCircle: 'Rundt logokort', statusReady: 'Klar', statusBrowserFallback: 'Browserforhåndsvisning: kør med Tauri for fuld motor',
    statusPreviewUpdated: 'Forhåndsvisning opdateret', statusPreparingExports: (count) => `${count} eksport${count === 1 ? '' : 'er'} forberedes`,
    statusFilesSaved: (count, path) => `${count} fil${count === 1 ? '' : 'er'} gemt: ${path}`, statusDecodeRunning: 'Decode-test kører',
    statusCsvReady: (count) => `${count} CSV-række${count === 1 ? '' : 'r'} klar`, statusUploadCsvFirst: 'Upload først en CSV',
    statusBatchSaved: (count) => `${count} batchfil${count === 1 ? '' : 'er'} gemt`, statusProjectSaved: 'Projektfil forberedt',
    statusProjectOpened: 'Projekt åbnet', errDecodeDesktop: 'Tauri desktop-tilstand kræves til decode-test', errBatchDesktop: 'Tauri desktop-tilstand kræves til CSV batch-eksport',
    errLogoImage: 'Vælg en billedfil til logoet', errInvalidProject: 'Ugyldig projektfil', errEmptyCsv: 'CSV er tom', browserFallbackWarning: 'Kør i Tauri desktop-tilstand for fuld QR-rendering.',
    density: 'fyldning', qualityControl: 'Kvalitetskontrol', noCriticalRisk: 'Ingen kritisk risiko fundet.', technicalSummary: 'Teknisk oversigt',
    modules: 'Moduler', darkModules: 'Mørke moduler', pngMemoryEstimate: 'PNG-hukommelsesestimat', payloadCount: (count) => `${count} tegn payload`,
    contentText: 'Tekst', contentEmail: 'E-mail', contentPhone: 'Telefon', contentEvent: 'Begivenhed', contentLocation: 'Placering',
    fieldText: 'Tekst', password: 'Adgangskode', encryption: 'Kryptering', noPassword: 'Ingen adgangskode', hiddenNetwork: 'Skjult netværk',
    recipient: 'Modtager', subject: 'Emne', message: 'Besked', fullName: 'Fuldt navn', company: 'Firma', title: 'Titel',
    start: 'Start', end: 'Slut', latitude: 'Breddegrad', longitude: 'Længdegrad', qrColor: 'QR-farve', background: 'Baggrund',
    transparentBackground: 'Gennemsigtig baggrund', moduleShape: 'Modulform', finderShape: 'Finder-form', separateFinderColor: 'Brug separat finderfarve',
    finderColor: 'Finderfarve', none: 'Ingen', frameColor: 'Frame-farve', logoSelect: 'Vælg logo', logoFileHint: 'PNG-, JPG- eller WebP-fil',
    selectedLogoAlt: 'Valgt logo', removeLogo: 'Fjern logo', logoScale: 'Logo-skala', logoPadding: 'Logo-padding', cardRadius: 'Kortradius',
    logoCardColor: 'Logokortfarve', exportTitle: 'Eksport', fileName: 'Filnavn', customSize: 'Brugerdefineret størrelse', add: 'Tilføj',
    exportNote: 'Ved én fil åbnes Gem; ved flere størrelser eller CSV batch åbnes mappevalg.', decodeTest: 'Kør QR decode-test', decodeSuccess: 'Decode-test bestået.', decodeFailed: 'Decode-test mislykkedes.',
    filesDownload: (count) => `Download ${count} fil${count === 1 ? '' : 'er'}`, csvUpload: 'Upload CSV',
    csvSummaryEmpty: 'CSV-kolonner: name,payload eller første kolonne som payload', csvSummaryReady: (count) => `${count} række${count === 1 ? '' : 'r'} klar`,
    csvBatchExport: 'CSV batch-eksport', saveProject: 'Gem projekt som JSON', openProject: 'Åbn JSON-projekt', resetDefaults: 'Nulstil til standard',
    content: 'Indhold', available: 'Ja', unavailable: 'Nej',
    defaults: { text: 'Omfattende QR-kode genereret med QR Studio.', emailSubject: 'Hej', emailBody: 'QR Studio testbesked', smsBody: 'Hej', eventLocation: 'Istanbul', fileName: 'qrstudio-export' },
  },
  no: {
    ...enAppText,
    tabContent: 'Innhold', tabExport: 'Eksport', tabProject: 'Prosjekt', engine: 'Rust render-motor', preview: 'Forhåndsvis',
    download: 'Last ned', preparing: 'Klargjør', livePreview: 'Live forhåndsvisning', canvasTitle: 'QR-lerret med fast størrelse',
    previewLoading: 'Klargjør forhåndsvisning', rustPreparing: 'Rust klargjøres', language: 'Språk', contentType: 'Innholdstype',
    qrStyle: 'QR-stil', themes: 'Temaer', logoCardCircle: 'Rundt logokort', statusReady: 'Klar',
    statusBrowserFallback: 'Nettleserforhåndsvisning: kjør med Tauri for full motor', statusPreviewUpdated: 'Forhåndsvisning oppdatert',
    statusPreparingExports: (count) => `${count} eksport${count === 1 ? '' : 'er'} klargjøres`, statusFilesSaved: (count, path) => `${count} fil${count === 1 ? '' : 'er'} lagret: ${path}`,
    statusDecodeRunning: 'Decode-test kjører', statusCsvReady: (count) => `${count} CSV-rad${count === 1 ? '' : 'er'} klar`,
    statusUploadCsvFirst: 'Last opp CSV først', statusBatchSaved: (count) => `${count} batchfil${count === 1 ? '' : 'er'} lagret`,
    statusProjectSaved: 'Prosjektfil klargjort', statusProjectOpened: 'Prosjekt åpnet', errDecodeDesktop: 'Tauri desktop-modus kreves for decode-test',
    errBatchDesktop: 'Tauri desktop-modus kreves for CSV batch-eksport', errLogoImage: 'Velg en bildefil for logoen', errInvalidProject: 'Ugyldig prosjektfil',
    errEmptyCsv: 'CSV er tom', browserFallbackWarning: 'Kjør i Tauri desktop-modus for full QR-rendering.', density: 'fylling',
    qualityControl: 'Kvalitetskontroll', noCriticalRisk: 'Ingen kritisk risiko oppdaget.', technicalSummary: 'Teknisk sammendrag',
    modules: 'Moduler', darkModules: 'Mørke moduler', pngMemoryEstimate: 'PNG-minneestimat', payloadCount: (count) => `${count} tegn payload`,
    contentText: 'Tekst', contentEmail: 'E-post', contentPhone: 'Telefon', contentEvent: 'Arrangement', contentLocation: 'Plassering',
    fieldText: 'Tekst', password: 'Passord', encryption: 'Kryptering', noPassword: 'Uten passord', hiddenNetwork: 'Skjult nettverk',
    recipient: 'Mottaker', subject: 'Emne', message: 'Melding', fullName: 'Fullt navn', company: 'Firma', title: 'Tittel',
    start: 'Start', end: 'Slutt', latitude: 'Breddegrad', longitude: 'Lengdegrad', qrColor: 'QR-farge', background: 'Bakgrunn',
    transparentBackground: 'Gjennomsiktig bakgrunn', moduleShape: 'Modulform', finderShape: 'Finder-form', separateFinderColor: 'Bruk separat finderfarge',
    finderColor: 'Finderfarge', none: 'Ingen', frameColor: 'Frame-farge', logoSelect: 'Velg logo', logoFileHint: 'PNG-, JPG- eller WebP-fil',
    selectedLogoAlt: 'Valgt logo', removeLogo: 'Fjern logo', logoScale: 'Logo-skala', logoPadding: 'Logo-padding', cardRadius: 'Kortradius',
    logoCardColor: 'Logokortfarge', exportTitle: 'Eksport', fileName: 'Filnavn', customSize: 'Egendefinert størrelse', add: 'Legg til',
    exportNote: 'For én fil åpnes Lagre; for flere størrelser eller CSV batch åpnes mappevalg.', decodeTest: 'Kjør QR decode-test', decodeSuccess: 'Decode-test bestått.', decodeFailed: 'Decode-test mislyktes.',
    filesDownload: (count) => `Last ned ${count} fil${count === 1 ? '' : 'er'}`, csvUpload: 'Last opp CSV',
    csvSummaryEmpty: 'CSV-kolonner: name,payload eller første kolonne som payload', csvSummaryReady: (count) => `${count} rad${count === 1 ? '' : 'er'} klar`,
    csvBatchExport: 'CSV batch-eksport', saveProject: 'Lagre prosjekt som JSON', openProject: 'Åpne JSON-prosjekt', resetDefaults: 'Tilbakestill standard',
    content: 'Innhold', available: 'Ja', unavailable: 'Nei',
    defaults: { text: 'Omfattende QR-kode generert med QR Studio.', emailSubject: 'Hei', emailBody: 'QR Studio testmelding', smsBody: 'Hei', eventLocation: 'Istanbul', fileName: 'qrstudio-export' },
  },
  it: {
    ...enAppText,
    tabContent: 'Contenuto', tabExport: 'Esporta', tabProject: 'Progetto', engine: 'Motore render Rust', preview: 'Anteprima',
    download: 'Scarica', preparing: 'Preparazione', livePreview: 'Anteprima live', canvasTitle: 'Canvas QR a dimensione fissa',
    previewLoading: 'Preparazione anteprima', rustPreparing: 'Rust in preparazione', language: 'Lingua', contentType: 'Tipo contenuto',
    qrStyle: 'Stile QR', themes: 'Temi', logoCardCircle: 'Scheda logo circolare', statusReady: 'Pronto',
    statusBrowserFallback: 'Anteprima browser: avvia con Tauri per il motore completo', statusPreviewUpdated: 'Anteprima aggiornata',
    statusPreparingExports: (count) => `${count} esportazione${count === 1 ? '' : 'i'} in preparazione`, statusFilesSaved: (count, path) => `${count} file salvati: ${path}`,
    statusDecodeRunning: 'Test decode in corso', statusCsvReady: (count) => `${count} riga${count === 1 ? '' : 'he'} CSV pronta${count === 1 ? '' : 'e'}`,
    statusUploadCsvFirst: 'Carica prima un CSV', statusBatchSaved: (count) => `${count} file batch salvati`, statusProjectSaved: 'File progetto preparato',
    statusProjectOpened: 'Progetto aperto', errDecodeDesktop: 'La modalità desktop Tauri è richiesta per il test decode',
    errBatchDesktop: 'La modalità desktop Tauri è richiesta per export CSV batch', errLogoImage: 'Scegli un file immagine per il logo',
    errInvalidProject: 'File progetto non valido', errEmptyCsv: 'CSV vuoto', browserFallbackWarning: 'Avvia in modalità desktop Tauri per render QR completo.',
    density: 'riempimento', qualityControl: 'Controllo qualità', noCriticalRisk: 'Nessun rischio critico rilevato.', technicalSummary: 'Riepilogo tecnico',
    modules: 'Moduli', darkModules: 'Moduli scuri', pngMemoryEstimate: 'Memoria PNG stimata', payloadCount: (count) => `${count} caratteri payload`,
    contentText: 'Testo', contentEmail: 'Email', contentPhone: 'Telefono', contentEvent: 'Evento', contentLocation: 'Posizione',
    fieldText: 'Testo', password: 'Password', encryption: 'Crittografia', noPassword: 'Senza password', hiddenNetwork: 'Rete nascosta',
    recipient: 'Destinatario', subject: 'Oggetto', message: 'Messaggio', fullName: 'Nome completo', company: 'Azienda', title: 'Titolo',
    start: 'Inizio', end: 'Fine', latitude: 'Latitudine', longitude: 'Longitudine', qrColor: 'Colore QR', background: 'Sfondo',
    transparentBackground: 'Sfondo trasparente', moduleShape: 'Forma modulo', finderShape: 'Forma finder', separateFinderColor: 'Usa colore finder separato',
    finderColor: 'Colore finder', none: 'Nessuno', frameColor: 'Colore frame', logoSelect: 'Scegli logo', logoFileHint: 'File PNG, JPG o WebP',
    selectedLogoAlt: 'Logo selezionato', removeLogo: 'Rimuovi logo', logoScale: 'Scala logo', logoPadding: 'Padding logo', cardRadius: 'Raggio scheda',
    logoCardColor: 'Colore scheda logo', exportTitle: 'Esporta', fileName: 'Nome file', customSize: 'Dimensione personalizzata', add: 'Aggiungi',
    exportNote: 'Per un file si apre Salva; per più dimensioni o CSV batch si apre selezione cartella.', decodeTest: 'Esegui test decode QR', decodeSuccess: 'Test decode riuscito.', decodeFailed: 'Test decode fallito.',
    filesDownload: (count) => `Scarica ${count} file`, csvUpload: 'Carica CSV', csvSummaryEmpty: 'Colonne CSV: name,payload o prima colonna come payload',
    csvSummaryReady: (count) => `${count} riga${count === 1 ? '' : 'he'} pronta${count === 1 ? '' : 'e'}`, csvBatchExport: 'Export CSV batch',
    saveProject: 'Salva progetto come JSON', openProject: 'Apri progetto JSON', resetDefaults: 'Ripristina predefiniti', content: 'Contenuto',
    available: 'Sì', unavailable: 'No',
    defaults: { text: 'Codice QR completo generato con QR Studio.', emailSubject: 'Ciao', emailBody: 'Messaggio di test QR Studio', smsBody: 'Ciao', eventLocation: 'Istanbul', fileName: 'qrstudio-export' },
  },
  ru: {
    ...enAppText,
    tabContent: 'Контент', tabDesign: 'Дизайн', tabExport: 'Экспорт', tabProject: 'Проект', engine: 'Rust-движок рендера',
    preview: 'Предпросмотр', download: 'Скачать', preparing: 'Подготовка', livePreview: 'Живой предпросмотр',
    canvasTitle: 'QR-холст фиксированного размера', previewLoading: 'Подготовка предпросмотра', rustPreparing: 'Rust готовится',
    language: 'Язык', contentType: 'Тип контента', qrStyle: 'Стиль QR', themes: 'Темы', logoCardCircle: 'Круглая карточка логотипа',
    statusReady: 'Готово', statusBrowserFallback: 'Предпросмотр браузера: запустите через Tauri для полного движка',
    statusPreviewUpdated: 'Предпросмотр обновлен', statusPreparingExports: (count) => `${count} экспорт(ов) готовится`,
    statusFilesSaved: (count, path) => `${count} файл(ов) сохранено: ${path}`, statusDecodeRunning: 'Decode-тест выполняется',
    statusCsvReady: (count) => `${count} строк CSV готово`, statusUploadCsvFirst: 'Сначала загрузите CSV', statusBatchSaved: (count) => `${count} batch-файл(ов) сохранено`,
    statusProjectSaved: 'Файл проекта подготовлен', statusProjectOpened: 'Проект открыт', errDecodeDesktop: 'Для decode-теста нужен desktop-режим Tauri',
    errBatchDesktop: 'Для CSV batch-экспорта нужен desktop-режим Tauri', errLogoImage: 'Выберите изображение для логотипа',
    errInvalidProject: 'Недействительный файл проекта', errEmptyCsv: 'CSV пустой', browserFallbackWarning: 'Запустите desktop-режим Tauri для полного QR-рендера.',
    density: 'заполнение', qualityControl: 'Контроль качества', noCriticalRisk: 'Критических рисков не обнаружено.', technicalSummary: 'Техническая сводка',
    modules: 'Модули', darkModules: 'Темные модули', pngMemoryEstimate: 'Оценка памяти PNG', payloadCount: (count) => `${count} символов payload`,
    contentText: 'Текст', contentWifi: 'Wi-Fi', contentEmail: 'Email', contentPhone: 'Телефон', contentEvent: 'Событие', contentLocation: 'Локация',
    fieldText: 'Текст', password: 'Пароль', encryption: 'Шифрование', noPassword: 'Без пароля', hiddenNetwork: 'Скрытая сеть',
    recipient: 'Получатель', subject: 'Тема', message: 'Сообщение', fullName: 'Полное имя', company: 'Компания', title: 'Заголовок',
    start: 'Начало', end: 'Конец', latitude: 'Широта', longitude: 'Долгота', qrColor: 'Цвет QR', background: 'Фон',
    transparentBackground: 'Прозрачный фон', moduleShape: 'Форма модуля', finderShape: 'Форма finder', separateFinderColor: 'Отдельный цвет finder',
    finderColor: 'Цвет finder', none: 'Нет', frameColor: 'Цвет frame', logoSelect: 'Выбрать логотип', logoFileHint: 'Файл PNG, JPG или WebP',
    selectedLogoAlt: 'Выбранный логотип', removeLogo: 'Удалить логотип', logoScale: 'Масштаб логотипа', logoPadding: 'Отступ логотипа',
    cardRadius: 'Радиус карточки', logoCardColor: 'Цвет карточки логотипа', exportTitle: 'Экспорт', fileName: 'Имя файла',
    customSize: 'Пользовательский размер', add: 'Добавить', exportNote: 'Для одного файла откроется сохранение; для нескольких размеров или CSV batch - выбор папки.',
    decodeTest: 'Запустить QR decode-тест', decodeSuccess: 'Decode-тест пройден.', decodeFailed: 'Decode-тест не пройден.', filesDownload: (count) => `Скачать ${count} файл(ов)`, csvUpload: 'Загрузить CSV',
    csvSummaryEmpty: 'CSV-колонки: name,payload или первая колонка как payload', csvSummaryReady: (count) => `${count} строк готово`,
    csvBatchExport: 'CSV batch-экспорт', saveProject: 'Сохранить проект как JSON', openProject: 'Открыть JSON-проект',
    resetDefaults: 'Сбросить по умолчанию', content: 'Контент', available: 'Да', unavailable: 'Нет',
    defaults: { text: 'Комплексный QR-код, созданный в QR Studio.', emailSubject: 'Привет', emailBody: 'Тестовое сообщение QR Studio', smsBody: 'Привет', eventLocation: 'Стамбул', fileName: 'qrstudio-export' },
  },
}

const exportSizePresets = [256, 512, 1024, 2048, 4096, 8192]
const wifiEncryptionOptions = [
  { value: 'WPA', label: 'WPA/WPA2' },
  { value: 'WEP', label: 'WEP' },
  { value: 'nopass', label: 'Şifresiz' },
] satisfies Array<{ value: StudioState['wifiEncryption']; label: string }>
const moduleShapeOptions = [
  { value: 'square', label: 'Square' },
  { value: 'rounded', label: 'Rounded' },
  { value: 'dot', label: 'Dot' },
  { value: 'diamond', label: 'Diamond' },
] satisfies Array<{ value: StudioState['moduleShape']; label: string }>
const finderShapeOptions = [
  { value: 'square', label: 'Square' },
  { value: 'rounded', label: 'Rounded' },
  { value: 'circle', label: 'Circle' },
] satisfies Array<{ value: StudioState['finderShape']; label: string }>
const errorCorrectionOptions = [
  { value: 'L', label: 'L - %7' },
  { value: 'M', label: 'M - %15' },
  { value: 'Q', label: 'Q - %25' },
  { value: 'H', label: 'H - %30' },
] satisfies Array<{ value: ErrorCorrection; label: string }>
const frameOptions = [
  { value: 'none', label: 'Yok' },
  ...Array.from({ length: 11 }, (_, index) => {
    const number = String(index + 1).padStart(2, '0')
    return { value: `frame-${number}` as FrameTemplate, label: `Scan me ${number}` }
  }),
] satisfies Array<{ value: FrameTemplate; label: string }>
const exportFormatOptions = [
  { value: 'png', label: 'PNG' },
  { value: 'jpg', label: 'JPG' },
  { value: 'webp', label: 'WebP' },
  { value: 'svg', label: 'SVG' },
  { value: 'pdf', label: 'PDF' },
] satisfies Array<{ value: ExportFormat; label: string }>

const initialState: StudioState = {
  language: 'en',
  contentKind: 'url',
  url: 'https://example.com',
  text: enAppText.defaults.text,
  wifiSsid: 'Studio WiFi',
  wifiPassword: 'super-secure-password',
  wifiEncryption: 'WPA',
  wifiHidden: false,
  emailTo: 'hello@example.com',
  emailSubject: enAppText.defaults.emailSubject,
  emailBody: enAppText.defaults.emailBody,
  phone: '+905551112233',
  smsBody: enAppText.defaults.smsBody,
  vcardName: 'QR Studio',
  vcardOrg: 'Design Lab',
  vcardTitle: 'Product',
  vcardPhone: '+905551112233',
  vcardEmail: 'hello@example.com',
  vcardUrl: 'https://example.com',
  eventTitle: 'QR Studio Demo',
  eventStart: '2026-06-24T10:00',
  eventEnd: '2026-06-24T11:00',
  eventLocation: enAppText.defaults.eventLocation,
  locationLat: '41.0082',
  locationLng: '28.9784',
  errorCorrection: 'H',
  margin: 4,
  moduleShape: 'square',
  finderShape: 'square',
  foreground: '#050505',
  background: '#ffffff',
  finderForeground: '#0057ff',
  separateFinders: false,
  transparentBackground: false,
  frameTemplate: 'none',
  frameText: 'Scan me',
  frameAccent: '#38bdf8',
  logo: null,
  exportFormat: 'png',
  exportSizes: [1024, 2048],
  customExportSize: 3000,
  fileName: enAppText.defaults.fileName,
}

function localizedInitialState(language: Language): StudioState {
  const defaults = appText[language].defaults
  return {
    ...initialState,
    language,
    text: defaults.text,
    emailSubject: defaults.emailSubject,
    emailBody: defaults.emailBody,
    smsBody: defaults.smsBody,
    eventLocation: defaults.eventLocation,
    fileName: defaults.fileName,
  }
}

function localizeExistingState(current: StudioState, language: Language): StudioState {
  const defaults = appText[language].defaults
  const fromDefault = (field: keyof AppText['defaults'], value: string) =>
    appLanguages.some((item) => appText[item.id].defaults[field] === value)
  return {
    ...current,
    language,
    text: fromDefault('text', current.text) ? defaults.text : current.text,
    emailSubject: fromDefault('emailSubject', current.emailSubject) ? defaults.emailSubject : current.emailSubject,
    emailBody: fromDefault('emailBody', current.emailBody) ? defaults.emailBody : current.emailBody,
    smsBody: fromDefault('smsBody', current.smsBody) ? defaults.smsBody : current.smsBody,
    eventLocation: fromDefault('eventLocation', current.eventLocation) ? defaults.eventLocation : current.eventLocation,
    fileName: fromDefault('fileName', current.fileName) ? defaults.fileName : current.fileName,
  }
}

function App() {
  const [state, setState] = useState<StudioState>(() => localizedInitialState('en'))
  const [activeTab, setActiveTab] = useState<Tab>('content')
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [isRendering, setIsRendering] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [status, setStatus] = useState(appText.en.statusReady)
  const [batchRows, setBatchRows] = useState<BatchRow[]>([])
  const logoInputRef = useRef<HTMLInputElement>(null)
  const projectInputRef = useRef<HTMLInputElement>(null)
  const batchInputRef = useRef<HTMLInputElement>(null)
  const previewRequestId = useRef(0)

  const payload = useMemo(() => buildPayload(state), [state])
  const request = useMemo(() => buildQrRequest(state, payload), [state, payload])
  const qualityScore = useMemo(() => scorePreview(preview), [preview])
  const labels = appText[state.language]

  const renderPreview = useCallback(async () => {
    const requestId = previewRequestId.current + 1
    previewRequestId.current = requestId
    setIsRendering(true)
    try {
      if (!isTauriRuntime()) {
        if (requestId !== previewRequestId.current) {
          return
        }
        setPreview(makeBrowserFallback(payload, labels))
        setStatus(labels.statusBrowserFallback)
        return
      }
      const response = await invoke<PreviewResponse>('render_qr_preview', { request })
      if (requestId !== previewRequestId.current) {
        return
      }
      setPreview(response)
      setStatus(labels.statusPreviewUpdated)
    } catch (error) {
      if (requestId === previewRequestId.current) {
        setStatus(formatAppError(error, labels))
      }
    } finally {
      if (requestId === previewRequestId.current) {
        setIsRendering(false)
      }
    }
  }, [labels, payload, request])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void renderPreview()
    }, 140)
    return () => window.clearTimeout(timeout)
  }, [renderPreview])

  async function handleExport() {
    const sizes = normalizedExportSizes(state)
    setExporting(true)
    setStatus(labels.statusPreparingExports(sizes.length))
    try {
      if (!isTauriRuntime()) {
        const response = await invoke<ExportResponse>('export_qr_asset', {
          request: buildExportRequests(state, request)[0],
        })
        downloadBase64(response.base64Data, response.mimeType, response.fileName)
        return
      }
      const response = await invoke<SavedExportResponse>('export_qr_files', {
        requests: buildExportRequests(state, request),
      })
      setStatus(labels.statusFilesSaved(response.paths.length, response.paths[0]))
    } catch (error) {
      setStatus(formatAppError(error, labels))
    } finally {
      setExporting(false)
    }
  }

  async function handleDecodeTest() {
    setStatus(labels.statusDecodeRunning)
    try {
      if (!isTauriRuntime()) {
        throw new Error(labels.errDecodeDesktop)
      }
      const response = await invoke<DecodeTestResponse>('run_qr_decode_test', { request })
      setStatus(response.success ? labels.decodeSuccess : labels.decodeFailed)
    } catch (error) {
      setStatus(formatAppError(error, labels))
    }
  }

  async function handleBatchCsvUpload(file: File | null) {
    if (!file) {
      return
    }
    if (file.size > MAX_CSV_FILE_BYTES) {
      setStatus(labels.errCsvTooLarge(MAX_CSV_FILE_BYTES / 1024 / 1024))
      return
    }
    try {
      const rows = parseCsvRows(await file.text(), labels)
      if (rows.length > MAX_CSV_ROWS) {
        throw new Error(`ERR_CSV_TOO_MANY_ROWS:${MAX_CSV_ROWS}`)
      }
      setBatchRows(rows)
      setStatus(labels.statusCsvReady(rows.length))
    } catch (error) {
      setStatus(formatAppError(error, labels))
    }
  }

  async function handleBatchExport() {
    if (!batchRows.length) {
      setStatus(labels.statusUploadCsvFirst)
      return
    }
    setExporting(true)
    try {
      if (!isTauriRuntime()) {
        throw new Error(labels.errBatchDesktop)
      }
      const sizes = normalizedExportSizes(state)
      if (batchRows.length * sizes.length > MAX_BATCH_EXPORTS) {
        throw new Error(`ERR_BATCH_TOO_LARGE:${MAX_BATCH_EXPORTS}`)
      }
      const requests = batchRows.flatMap((row) =>
        sizes.map((size) => ({
          qr: buildQrRequest(state, row.payload),
          format: state.exportFormat,
          size,
          fileName: `${state.fileName}-${safeName(row.name)}-${size}`,
        })),
      )
      const response = await invoke<SavedExportResponse>('export_qr_files', { requests })
      setStatus(labels.statusBatchSaved(response.paths.length))
    } catch (error) {
      setStatus(formatAppError(error, labels))
    } finally {
      setExporting(false)
    }
  }

  async function handleLogoUpload(file: File | null) {
    if (!file) {
      return
    }
    if (!file.type.startsWith('image/')) {
      setStatus(labels.errLogoImage)
      return
    }
    if (file.type === 'image/svg+xml') {
      setStatus(labels.errLogoSvgUnsupported)
      return
    }
    if (file.size > MAX_LOGO_FILE_BYTES) {
      setStatus(labels.errLogoTooLarge(MAX_LOGO_FILE_BYTES / 1024 / 1024))
      return
    }
    const dataUrl = await fileToDataUrl(file)
    setState((current) => ({
      ...current,
      logo: {
        dataUrl,
        name: file.name,
        scale: current.logo?.scale ?? 0.2,
        padding: current.logo?.padding ?? 28,
        cardColor: current.logo?.cardColor ?? '#ffffff',
        radius: current.logo?.radius ?? 32,
        circleCard: current.logo?.circleCard ?? false,
      },
      errorCorrection: current.errorCorrection === 'L' ? 'H' : current.errorCorrection,
    }))
  }

  function saveProject() {
    const content = JSON.stringify({ version: 1, state }, null, 2)
    const blob = new Blob([content], { type: 'application/json' })
    downloadBlob(blob, `${state.fileName || 'qrstudio-project'}.qrstudio.json`)
    setStatus(labels.statusProjectSaved)
  }

  async function openProject(file: File | null) {
    if (!file) {
      return
    }
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as { state?: StudioState }
      if (!parsed.state) {
        throw new Error(labels.errInvalidProject)
      }
      setState({ ...localizedInitialState(parsed.state.language ?? state.language), ...parsed.state })
      setStatus(labels.statusProjectOpened)
    } catch (error) {
      setStatus(formatAppError(error, labels))
    }
  }

  return (
    <main className="studio-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <img src="/huzstudio_logo.svg" alt="HuzStudio" />
          </span>
          <div>
            <strong>QR Studio</strong>
            <small>{labels.engine}</small>
          </div>
        </div>
        <div className="topbar-actions">
          <div className="language-select" title={labels.language}>
            <Languages size={15} />
            <CustomSelect value={state.language} options={appLanguages.map((language) => ({ value: language.id, label: language.label }))} onChange={(language) => {
              setState((current) => localizeExistingState(current, language))
              setStatus(appText[language].statusReady)
            }} />
          </div>
          <Badge tone={qualityScore >= 82 ? 'good' : qualityScore >= 60 ? 'warn' : 'bad'}>
            <ShieldCheck size={14} />
            {qualityScore}/100
          </Badge>
          <button className="button ghost" type="button" onClick={() => void renderPreview()}>
            <RefreshCw size={16} />
            {labels.preview}
          </button>
          <button className="button primary" type="button" onClick={() => void handleExport()} disabled={exporting}>
            <Download size={16} />
            {exporting ? labels.preparing : labels.download}
          </button>
        </div>
      </header>

      <section className="workspace">
        <aside className="sidebar">
          <nav className="tabbar">
            {tabs.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  className={activeTab === tab.id ? 'tab active' : 'tab'}
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                >
                  <Icon size={16} />
                  {labels[tab.labelKey]}
                </button>
              )
            })}
          </nav>

          <div className="panel-scroll">
            {activeTab === 'content' && <ContentPanel state={state} setState={setState} payload={payload} />}
            {activeTab === 'design' && <DesignPanel state={state} setState={setState} />}
            {activeTab === 'logo' && (
              <LogoPanel
                logoInputRef={logoInputRef}
                state={state}
                setState={setState}
                onLogoUpload={(file) => void handleLogoUpload(file)}
              />
            )}
            {activeTab === 'export' && (
              <ExportPanel
                batchInputRef={batchInputRef}
                batchRows={batchRows}
                exporting={exporting}
                onBatchExport={() => void handleBatchExport()}
                onBatchUpload={(file) => void handleBatchCsvUpload(file)}
                onDecodeTest={() => void handleDecodeTest()}
                onExport={() => void handleExport()}
                state={state}
                setState={setState}
              />
            )}
            {activeTab === 'project' && (
              <ProjectPanel
                projectInputRef={projectInputRef}
                state={state}
                setState={setState}
                onSaveProject={saveProject}
                onOpenProject={(file) => void openProject(file)}
              />
            )}
          </div>
        </aside>

        <section className="preview-zone">
          <div className="preview-header">
            <div>
              <p className="eyebrow">{labels.livePreview}</p>
              <h1>{labels.canvasTitle}</h1>
            </div>
            <div className="preview-meta">
              <span>{preview?.stats.previewSize ?? 768}px preview</span>
              <span>{preview ? `${Math.round(preview.stats.density * 100)}% ${labels.density}` : labels.rustPreparing}</span>
            </div>
          </div>

          <div className="preview-card">
            {isRendering && <div className="rendering-pill">Render</div>}
            {preview ? (
              <div className="qr-canvas" dangerouslySetInnerHTML={{ __html: preview.svg }} />
            ) : (
              <div className="empty-preview">
                <QrCode size={48} />
                {labels.previewLoading}
              </div>
            )}
          </div>

          <div className="inspector-grid">
            <div className="inspector-card">
              <div className="inspector-title">
                <ShieldCheck size={16} />
                {labels.qualityControl}
              </div>
              {preview?.warnings.length ? (
                <ul className="warning-list">
                  {preview.warnings.map((warning) => (
                    <li key={warning}>
                      <AlertTriangle size={15} />
                      {localizeWarning(warning, labels)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted-line">
                  <CheckCircle2 size={15} />
                  {labels.noCriticalRisk}
                </p>
              )}
            </div>
            <div className="inspector-card">
              <div className="inspector-title">
                <SlidersHorizontal size={16} />
                {labels.technicalSummary}
              </div>
              <div className="stat-row">
                <span>{labels.modules}</span>
                <strong>{preview?.stats.modules ?? '-'}</strong>
              </div>
              <div className="stat-row">
                <span>{labels.darkModules}</span>
                <strong>{preview?.stats.darkModules ?? '-'}</strong>
              </div>
              <div className="stat-row">
                <span>{labels.pngMemoryEstimate}</span>
                <strong>{preview ? `${preview.stats.estimatedPngMemoryMb.toFixed(1)} MB` : '-'}</strong>
              </div>
            </div>
          </div>
        </section>
      </section>

      <footer className="statusbar">
        <div className="statusbar-left">
          <span>{status}</span>
          <span>{labels.payloadCount(payload.length)}</span>
        </div>
        <span className="copyright">Copyright HuzStudio 2026</span>
      </footer>
    </main>
  )
}

function ContentPanel({ state, setState, payload }: PanelProps & { payload: string }) {
  const labels = appText[state.language]
  return (
    <div className="panel-stack">
      <SectionTitle icon={Type} title={labels.contentType} />
      <div className="content-grid">
        <ContentButton state={state} setState={setState} id="url" icon={Link} label={labels.contentUrl} />
        <ContentButton state={state} setState={setState} id="text" icon={Type} label={labels.contentText} />
        <ContentButton state={state} setState={setState} id="wifi" icon={Wifi} label={labels.contentWifi} />
        <ContentButton state={state} setState={setState} id="email" icon={Mail} label={labels.contentEmail} />
        <ContentButton state={state} setState={setState} id="phone" icon={Phone} label={labels.contentPhone} />
        <ContentButton state={state} setState={setState} id="sms" icon={Phone} label={labels.contentSms} />
        <ContentButton state={state} setState={setState} id="vcard" icon={Contact} label={labels.contentVcard} />
        <ContentButton state={state} setState={setState} id="event" icon={CalendarDays} label={labels.contentEvent} />
        <ContentButton state={state} setState={setState} id="location" icon={MapPin} label={labels.contentLocation} />
      </div>

      {state.contentKind === 'url' && (
        <Field label="URL">
          <input value={state.url} onChange={(event) => update(setState, { url: event.target.value })} />
        </Field>
      )}
      {state.contentKind === 'text' && (
        <Field label={labels.fieldText}>
          <textarea value={state.text} onChange={(event) => update(setState, { text: event.target.value })} rows={7} />
        </Field>
      )}
      {state.contentKind === 'wifi' && (
        <>
          <Field label="SSID">
            <input value={state.wifiSsid} onChange={(event) => update(setState, { wifiSsid: event.target.value })} />
          </Field>
          <Field label={labels.password}>
            <input value={state.wifiPassword} onChange={(event) => update(setState, { wifiPassword: event.target.value })} />
          </Field>
          <Field label={labels.encryption}>
            <CustomSelect value={state.wifiEncryption} options={localizedWifiEncryptionOptions(labels)} onChange={(wifiEncryption) => update(setState, { wifiEncryption })} />
          </Field>
          <SwitchField label={labels.hiddenNetwork} checked={state.wifiHidden} onChange={(wifiHidden) => update(setState, { wifiHidden })} />
        </>
      )}
      {state.contentKind === 'email' && (
        <>
          <Field label={labels.recipient}>
            <input value={state.emailTo} onChange={(event) => update(setState, { emailTo: event.target.value })} />
          </Field>
          <Field label={labels.subject}>
            <input value={state.emailSubject} onChange={(event) => update(setState, { emailSubject: event.target.value })} />
          </Field>
          <Field label={labels.message}>
            <textarea value={state.emailBody} onChange={(event) => update(setState, { emailBody: event.target.value })} rows={5} />
          </Field>
        </>
      )}
      {state.contentKind === 'phone' && (
        <Field label="Telefon">
          <input value={state.phone} onChange={(event) => update(setState, { phone: event.target.value })} />
        </Field>
      )}
      {state.contentKind === 'sms' && (
        <>
          <Field label="Telefon">
            <input value={state.phone} onChange={(event) => update(setState, { phone: event.target.value })} />
          </Field>
          <Field label={labels.message}>
            <textarea value={state.smsBody} onChange={(event) => update(setState, { smsBody: event.target.value })} rows={4} />
          </Field>
        </>
      )}
      {state.contentKind === 'vcard' && (
        <>
          <Field label={labels.fullName}>
            <input value={state.vcardName} onChange={(event) => update(setState, { vcardName: event.target.value })} />
          </Field>
          <TwoColumns>
            <Field label={labels.company}>
              <input value={state.vcardOrg} onChange={(event) => update(setState, { vcardOrg: event.target.value })} />
            </Field>
            <Field label={labels.title}>
              <input value={state.vcardTitle} onChange={(event) => update(setState, { vcardTitle: event.target.value })} />
            </Field>
          </TwoColumns>
          <TwoColumns>
            <Field label="Telefon">
              <input value={state.vcardPhone} onChange={(event) => update(setState, { vcardPhone: event.target.value })} />
            </Field>
            <Field label="E-posta">
              <input value={state.vcardEmail} onChange={(event) => update(setState, { vcardEmail: event.target.value })} />
            </Field>
          </TwoColumns>
          <Field label="Web">
            <input value={state.vcardUrl} onChange={(event) => update(setState, { vcardUrl: event.target.value })} />
          </Field>
        </>
      )}
      {state.contentKind === 'event' && (
        <>
          <Field label={labels.title}>
            <input value={state.eventTitle} onChange={(event) => update(setState, { eventTitle: event.target.value })} />
          </Field>
          <TwoColumns>
            <Field label={labels.start}>
              <input type="datetime-local" value={state.eventStart} onChange={(event) => update(setState, { eventStart: event.target.value })} />
            </Field>
            <Field label={labels.end}>
              <input type="datetime-local" value={state.eventEnd} onChange={(event) => update(setState, { eventEnd: event.target.value })} />
            </Field>
          </TwoColumns>
          <Field label={labels.contentLocation}>
            <input value={state.eventLocation} onChange={(event) => update(setState, { eventLocation: event.target.value })} />
          </Field>
        </>
      )}
      {state.contentKind === 'location' && (
        <TwoColumns>
          <Field label={labels.latitude}>
            <input value={state.locationLat} onChange={(event) => update(setState, { locationLat: event.target.value })} />
          </Field>
          <Field label={labels.longitude}>
            <input value={state.locationLng} onChange={(event) => update(setState, { locationLng: event.target.value })} />
          </Field>
        </TwoColumns>
      )}

      <div className="payload-box">
        <span>{labels.payload}</span>
        <code>{payload}</code>
      </div>
    </div>
  )
}

function DesignPanel({ state, setState }: PanelProps) {
  const labels = appText[state.language]
  return (
    <div className="panel-stack">
      <SectionTitle icon={Palette} title={labels.qrStyle} />
      <TwoColumns>
        <Field label={labels.qrColor}>
          <input type="color" value={state.foreground} onChange={(event) => update(setState, { foreground: event.target.value })} />
        </Field>
        <Field label={labels.background}>
          <input type="color" value={state.background} onChange={(event) => update(setState, { background: event.target.value })} />
        </Field>
      </TwoColumns>
      <SwitchField label={labels.transparentBackground} checked={state.transparentBackground} onChange={(transparentBackground) => update(setState, { transparentBackground })} />
      <Field label={labels.moduleShape}>
        <CustomSelect value={state.moduleShape} options={moduleShapeOptions} onChange={(moduleShape) => update(setState, { moduleShape })} />
      </Field>
      <Field label={labels.finderShape}>
        <CustomSelect value={state.finderShape} options={finderShapeOptions} onChange={(finderShape) => update(setState, { finderShape })} />
      </Field>
      <SwitchField label={labels.separateFinderColor} checked={state.separateFinders} onChange={(separateFinders) => update(setState, { separateFinders })} />
      {state.separateFinders && (
        <Field label={labels.finderColor}>
          <input type="color" value={state.finderForeground} onChange={(event) => update(setState, { finderForeground: event.target.value })} />
        </Field>
      )}
      <TwoColumns>
        <Field label={labels.errorCorrection}>
          <CustomSelect value={state.errorCorrection} options={errorCorrectionOptions} onChange={(errorCorrection) => update(setState, { errorCorrection })} />
        </Field>
        <Field label={labels.quietZone}>
          <input type="number" min={0} max={16} value={state.margin} onChange={(event) => update(setState, { margin: Number(event.target.value) })} />
        </Field>
      </TwoColumns>
      <SectionTitle icon={Sparkles} title={labels.themes} />
      <div className="preset-row">
        <button type="button" className="preset classic" onClick={() => update(setState, { foreground: '#050505', background: '#ffffff', moduleShape: 'square', finderShape: 'square', separateFinders: false })}>
          Classic
        </button>
        <button type="button" className="preset soft" onClick={() => update(setState, { foreground: '#172033', background: '#f8fafc', moduleShape: 'rounded', finderShape: 'rounded', separateFinders: true, finderForeground: '#0f766e' })}>
          Soft
        </button>
        <button type="button" className="preset modern" onClick={() => update(setState, { foreground: '#101828', background: '#ffffff', moduleShape: 'dot', finderShape: 'circle', separateFinders: true, finderForeground: '#2563eb' })}>
          Modern
        </button>
      </div>
      <SectionTitle icon={QrCode} title={labels.frameTemplate} />
      <Field label={labels.frame}>
        <CustomSelect value={state.frameTemplate} options={localizedFrameOptions(labels)} onChange={(frameTemplate) => update(setState, { frameTemplate })} />
      </Field>
      {state.frameTemplate !== 'none' && (
        <Field label={labels.frameColor}>
          <input type="color" value={state.frameAccent} onChange={(event) => update(setState, { frameAccent: event.target.value })} />
        </Field>
      )}
    </div>
  )
}

function LogoPanel({ state, setState, logoInputRef, onLogoUpload }: PanelProps & {
  logoInputRef: React.RefObject<HTMLInputElement | null>
  onLogoUpload: (file: File | null) => void
}) {
  const labels = appText[state.language]
  return (
    <div className="panel-stack">
      <SectionTitle icon={ImagePlus} title={labels.logoTitle} />
      <input ref={logoInputRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => onLogoUpload(event.target.files?.[0] ?? null)} />
      <button className="dropzone" type="button" onClick={() => logoInputRef.current?.click()}>
        <Upload size={22} />
        <strong>{state.logo ? state.logo.name : labels.logoSelect}</strong>
        <span>{labels.logoFileHint}</span>
      </button>
      {state.logo && (
        <>
          <div className="logo-preview">
            <img src={state.logo.dataUrl} alt={labels.selectedLogoAlt} />
            <button className="icon-button" type="button" onClick={() => update(setState, { logo: null })} title={labels.removeLogo}>
              <X size={16} />
            </button>
          </div>
          <RangeField label={labels.logoScale} min={0.08} max={0.34} step={0.01} value={state.logo.scale} onChange={(scale) => patchLogo(setState, { scale })} />
          <RangeField label={labels.logoPadding} min={0} max={80} step={2} value={state.logo.padding} onChange={(padding) => patchLogo(setState, { padding })} />
          <SwitchField label={labels.logoCardCircle} checked={Boolean(state.logo.circleCard)} onChange={(circleCard) => patchLogo(setState, { circleCard })} />
          <RangeField label={labels.cardRadius} min={0} max={220} step={2} value={state.logo.radius} onChange={(radius) => patchLogo(setState, { radius })} />
          <Field label={labels.logoCardColor}>
            <input type="color" value={state.logo.cardColor} onChange={(event) => patchLogo(setState, { cardColor: event.target.value })} />
          </Field>
        </>
      )}
    </div>
  )
}

function ExportPanel({
  batchInputRef,
  batchRows,
  exporting,
  onBatchExport,
  onBatchUpload,
  onDecodeTest,
  onExport,
  state,
  setState,
}: PanelProps & {
  batchInputRef: React.RefObject<HTMLInputElement | null>
  batchRows: BatchRow[]
  exporting: boolean
  onBatchExport: () => void
  onBatchUpload: (file: File | null) => void
  onDecodeTest: () => void
  onExport: () => void
}) {
  const labels = appText[state.language]
  return (
    <div className="panel-stack">
      <SectionTitle icon={Download} title={labels.exportTitle} />
      <Field label={labels.format}>
        <CustomSelect value={state.exportFormat} options={exportFormatOptions} onChange={(exportFormat) => update(setState, { exportFormat })} />
      </Field>
      <Field label={labels.fileName}>
        <input value={state.fileName} onChange={(event) => update(setState, { fileName: event.target.value })} />
      </Field>
      <div className="size-grid">
        {exportSizePresets.map((size) => (
          <button
            className={state.exportSizes.includes(size) ? 'size-chip active' : 'size-chip'}
            key={size}
            type="button"
            onClick={() => toggleExportSize(setState, size)}
          >
            {size}
          </button>
        ))}
      </div>
      <TwoColumns>
        <Field label={labels.customSize}>
          <input type="number" min={128} max={20000} value={state.customExportSize} onChange={(event) => update(setState, { customExportSize: Number(event.target.value) })} />
        </Field>
        <button className="button secondary align-end" type="button" onClick={() => toggleExportSize(setState, state.customExportSize)}>
          {labels.add}
        </button>
      </TwoColumns>
      <div className="export-note">
        {labels.exportNote}
      </div>
      <button className="button secondary wide" type="button" onClick={onDecodeTest}>
        <ShieldCheck size={16} />
        {labels.decodeTest}
      </button>
      <button className="button primary wide" type="button" onClick={onExport} disabled={exporting}>
        <Download size={16} />
        {exporting ? labels.preparing : labels.filesDownload(normalizedExportSizes(state).length)}
      </button>
      <SectionTitle icon={FileJson} title={labels.csvBatchTitle} />
      <input ref={batchInputRef} hidden type="file" accept=".csv,text/csv" onChange={(event) => onBatchUpload(event.target.files?.[0] ?? null)} />
      <button className="button ghost wide" type="button" onClick={() => batchInputRef.current?.click()}>
        <Upload size={16} />
        {labels.csvUpload}
      </button>
      <div className="batch-summary">
        <span>{batchRows.length ? labels.csvSummaryReady(batchRows.length) : labels.csvSummaryEmpty}</span>
        {batchRows.slice(0, 3).map((row) => (
          <code key={row.id}>{row.name}: {row.payload}</code>
        ))}
      </div>
      <button className="button secondary wide" type="button" onClick={onBatchExport} disabled={exporting || !batchRows.length}>
        <Download size={16} />
        {labels.csvBatchExport}
      </button>
    </div>
  )
}

function ProjectPanel({ state, setState, projectInputRef, onSaveProject, onOpenProject }: PanelProps & {
  projectInputRef: React.RefObject<HTMLInputElement | null>
  onSaveProject: () => void
  onOpenProject: (file: File | null) => void
}) {
  const labels = appText[state.language]
  return (
    <div className="panel-stack">
      <SectionTitle icon={FileJson} title={labels.projectTitle} />
      <input ref={projectInputRef} hidden type="file" accept=".json,.qrstudio" onChange={(event) => onOpenProject(event.target.files?.[0] ?? null)} />
      <button className="button secondary wide" type="button" onClick={onSaveProject}>
        <Save size={16} />
        {labels.saveProject}
      </button>
      <button className="button ghost wide" type="button" onClick={() => projectInputRef.current?.click()}>
        <Upload size={16} />
        {labels.openProject}
      </button>
      <button className="button ghost wide" type="button" onClick={() => setState(localizedInitialState(state.language))}>
        <RefreshCw size={16} />
        {labels.resetDefaults}
      </button>
      <div className="project-summary">
        <div>
          <span>{labels.content}</span>
          <strong>{state.contentKind}</strong>
        </div>
        <div>
          <span>{labels.export}</span>
          <strong>{state.exportFormat.toUpperCase()}</strong>
        </div>
        <div>
          <span>{labels.logoTitle}</span>
          <strong>{state.logo ? labels.available : labels.unavailable}</strong>
        </div>
      </div>
    </div>
  )
}

interface PanelProps {
  state: StudioState
  setState: React.Dispatch<React.SetStateAction<StudioState>>
}

function ContentButton({ state, setState, id, label, icon: Icon }: PanelProps & { id: ContentKind; label: string; icon: typeof Type }) {
  return (
    <button className={state.contentKind === id ? 'content-button active' : 'content-button'} type="button" onClick={() => update(setState, { contentKind: id })}>
      <Icon size={15} />
      {label}
    </button>
  )
}

function SectionTitle({ icon: Icon, title }: { icon: typeof Type; title: string }) {
  return (
    <div className="section-title">
      <Icon size={16} />
      <span>{title}</span>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <span>{label}</span>
      {children}
    </div>
  )
}

function CustomSelect<T extends string>({ value, options, onChange }: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
}) {
  const [open, setOpen] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = options.find((option) => option.value === value) ?? options[0]
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === selected?.value))

  useEffect(() => {
    if (!open) {
      return
    }
    setFocusedIndex(selectedIndex)
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    window.addEventListener('mousedown', closeOnOutsideClick)
    return () => window.removeEventListener('mousedown', closeOnOutsideClick)
  }, [open, selectedIndex])

  function choose(option: { value: T; label: string }) {
    onChange(option.value)
    setOpen(false)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (!open && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault()
      setOpen(true)
      return
    }
    if (!open) {
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const direction = event.key === 'ArrowDown' ? 1 : -1
      setFocusedIndex((current) => (current + direction + options.length) % options.length)
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      choose(options[focusedIndex] ?? selected)
    }
  }

  return (
    <div className="select-root" ref={rootRef}>
      <button
        className={open ? 'select-trigger open' : 'select-trigger'}
        type="button"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleKeyDown}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span>{selected?.label}</span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="select-popover" role="listbox">
          {options.map((option, index) => (
            <button
              className={[
                'select-option',
                option.value === value ? 'selected' : '',
                index === focusedIndex ? 'focused' : '',
              ].filter(Boolean).join(' ')}
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              onMouseEnter={() => setFocusedIndex(index)}
              onClick={() => choose(option)}
            >
              <span>{option.label}</span>
              {option.value === value && <Check size={15} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function SwitchField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="switch-field">
      <span>{label}</span>
      <button className={checked ? 'switch on' : 'switch'} type="button" onClick={() => onChange(!checked)} aria-pressed={checked}>
        <span />
      </button>
    </label>
  )
}

function RangeField({ label, min, max, step, value, onChange }: { label: string; min: number; max: number; step: number; value: number; onChange: (value: number) => void }) {
  return (
    <label className="field">
      <span>
        {label}
        <strong>{typeof value === 'number' ? value.toFixed(step < 1 ? 2 : 0) : value}</strong>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  )
}

function TwoColumns({ children }: { children: React.ReactNode }) {
  return <div className="two-columns">{children}</div>
}

function Badge({ children, tone }: { children: React.ReactNode; tone: 'good' | 'warn' | 'bad' }) {
  return <span className={`badge ${tone}`}>{children}</span>
}

function update(setState: React.Dispatch<React.SetStateAction<StudioState>>, patch: Partial<StudioState>) {
  setState((current) => ({ ...current, ...patch }))
}

function patchLogo(setState: React.Dispatch<React.SetStateAction<StudioState>>, patch: Partial<LogoState>) {
  setState((current) => (current.logo ? { ...current, logo: { ...current.logo, ...patch } } : current))
}

function toggleExportSize(setState: React.Dispatch<React.SetStateAction<StudioState>>, size: number) {
  const normalized = Math.round(size)
  if (!Number.isFinite(normalized) || normalized < 128) {
    return
  }
  setState((current) => {
    const exists = current.exportSizes.includes(normalized)
    const exportSizes = exists ? current.exportSizes.filter((item) => item !== normalized) : [...current.exportSizes, normalized]
    return { ...current, exportSizes: exportSizes.sort((a, b) => a - b) }
  })
}

function normalizedExportSizes(state: StudioState) {
  return [...new Set(state.exportSizes)].filter((size) => size >= 128).sort((a, b) => a - b)
}

function localizedWifiEncryptionOptions(labels: AppText) {
  return wifiEncryptionOptions.map((option) => (
    option.value === 'nopass' ? { ...option, label: labels.noPassword } : option
  ))
}

function localizedFrameOptions(labels: AppText) {
  return frameOptions.map((option) => (
    option.value === 'none' ? { ...option, label: labels.none } : option
  ))
}

function buildExportRequests(state: StudioState, qr: ReturnType<typeof buildQrRequest>) {
  return normalizedExportSizes(state).map((size) => ({
    qr,
    format: state.exportFormat,
    size,
    fileName: `${state.fileName}-${size}`,
  }))
}

function buildQrRequest(state: StudioState, payload: string) {
  return {
    payload,
    errorCorrection: state.errorCorrection,
    margin: state.margin,
    moduleShape: state.moduleShape,
    finderShape: state.finderShape,
    foreground: state.foreground,
    background: state.background,
    finderForeground: state.finderForeground,
    separateFinders: state.separateFinders,
    transparentBackground: state.transparentBackground,
    frameTemplate: state.frameTemplate,
    frameText: state.frameText,
    frameAccent: state.frameAccent,
    logo: state.logo
      ? {
          dataUrl: state.logo.dataUrl,
          scale: state.logo.scale,
          padding: state.logo.padding,
          cardColor: state.logo.cardColor,
          radius: state.logo.radius,
          circleCard: state.logo.circleCard ?? false,
        }
      : null,
  }
}

function parseCsvRows(text: string, labels: AppText): BatchRow[] {
  const rows = parseCsv(text).filter((row) => row.some((cell) => cell.trim()))
  if (!rows.length) {
    throw new Error(labels.errEmptyCsv)
  }
  const headers = rows[0].map((cell) => cell.trim().toLowerCase())
  const hasHeader = headers.includes('payload') || headers.includes('url') || headers.includes('name')
  const dataRows = hasHeader ? rows.slice(1) : rows
  const payloadIndex = hasHeader ? Math.max(headers.indexOf('payload'), headers.indexOf('url')) : 0
  const nameIndex = hasHeader ? headers.indexOf('name') : -1

  return dataRows
    .map((row, index) => {
      const payload = row[payloadIndex] || row[0] || ''
      const name = nameIndex >= 0 ? row[nameIndex] || `row-${index + 1}` : `row-${index + 1}`
      return {
        id: `${index}-${payload}`,
        name: safeName(name),
        payload: payload.trim(),
      }
    })
    .filter((row) => row.payload)
}

function parseCsv(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    const next = text[index + 1]
    if (character === '"' && quoted && next === '"') {
      cell += '"'
      index += 1
    } else if (character === '"') {
      quoted = !quoted
    } else if (character === ',' && !quoted) {
      row.push(cell)
      cell = ''
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && next === '\n') {
        index += 1
      }
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += character
    }
  }
  row.push(cell)
  rows.push(row)
  return rows
}

function safeName(value: string) {
  const cleaned = value
    .trim()
    .split('')
    .map((character) => (character.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(character) ? '-' : character))
    .join('')
  return cleaned || 'qr'
}

function buildPayload(state: StudioState) {
  switch (state.contentKind) {
    case 'text':
      return state.text || ' '
    case 'wifi':
      return `WIFI:T:${state.wifiEncryption};S:${escapeQrField(state.wifiSsid)};P:${escapeQrField(state.wifiPassword)};H:${state.wifiHidden ? 'true' : 'false'};;`
    case 'email':
      return `mailto:${state.emailTo}?subject=${encodeURIComponent(state.emailSubject)}&body=${encodeURIComponent(state.emailBody)}`
    case 'phone':
      return `tel:${state.phone}`
    case 'sms':
      return `SMSTO:${state.phone}:${state.smsBody}`
    case 'vcard':
      return ['BEGIN:VCARD', 'VERSION:3.0', `FN:${state.vcardName}`, `ORG:${state.vcardOrg}`, `TITLE:${state.vcardTitle}`, `TEL:${state.vcardPhone}`, `EMAIL:${state.vcardEmail}`, `URL:${state.vcardUrl}`, 'END:VCARD'].join('\n')
    case 'event':
      return ['BEGIN:VEVENT', `SUMMARY:${state.eventTitle}`, `DTSTART:${formatIcalDate(state.eventStart)}`, `DTEND:${formatIcalDate(state.eventEnd)}`, `LOCATION:${state.eventLocation}`, 'END:VEVENT'].join('\n')
    case 'location':
      return `geo:${state.locationLat},${state.locationLng}`
    case 'url':
    default:
      return state.url || 'https://example.com'
  }
}

function escapeQrField(value: string) {
  return value.replaceAll('\\', '\\\\').replaceAll(';', '\\;').replaceAll(',', '\\,').replaceAll(':', '\\:')
}

function formatIcalDate(value: string) {
  if (!value) {
    return ''
  }
  return value.replaceAll('-', '').replaceAll(':', '').replace('T', 'T')
}

function scorePreview(preview: PreviewResponse | null) {
  if (!preview) {
    return 0
  }
  return Math.max(30, Math.min(100, 100 - preview.warnings.length * 14 - Math.max(0, preview.stats.density - 0.52) * 80))
}

function isTauriRuntime() {
  return '__TAURI_INTERNALS__' in window
}

function localizeWarning(warning: string, labels: AppText) {
  const key = warning as keyof AppText['warnings']
  return Object.prototype.hasOwnProperty.call(labels.warnings, key) ? labels.warnings[key] : warning
}

function formatAppError(error: unknown, labels: AppText) {
  const raw = error instanceof Error ? error.message : String(error)
  const message = raw.replace(/^Error:\s*/, '')
  const [code, ...parts] = message.split(':')

  switch (code) {
    case 'ERR_EXPORT_EMPTY':
      return labels.errExportEmpty
    case 'ERR_EXPORT_TOO_MANY':
      return labels.errBatchTooLarge(Number(parts[0] ?? MAX_BATCH_EXPORTS))
    case 'ERR_SAVE_CANCELLED':
      return labels.errSaveCancelled
    case 'ERR_FOLDER_CANCELLED':
      return labels.errFolderCancelled
    case 'ERR_RASTER_TOO_LARGE':
      return labels.errRasterTooLarge(parts[0] ?? '', parts[1] ?? '', parts[2] ?? '')
    case 'ERR_LOGO_DATA_URL':
    case 'ERR_LOGO_EMPTY':
      return labels.errLogoImage
    case 'ERR_LOGO_SVG_UNSUPPORTED':
      return labels.errLogoSvgUnsupported
    case 'ERR_LOGO_TOO_LARGE':
      return labels.errLogoTooLarge(Number(parts[0] ?? MAX_LOGO_FILE_BYTES / 1024 / 1024))
    case 'ERR_LOGO_PIXELS':
      return labels.errLogoPixelsTooLarge(Number(parts[0] ?? 16))
    case 'ERR_CSV_TOO_MANY_ROWS':
      return labels.errCsvTooManyRows(Number(parts[0] ?? MAX_CSV_ROWS))
    case 'ERR_BATCH_TOO_LARGE':
      return labels.errBatchTooLarge(Number(parts[0] ?? MAX_BATCH_EXPORTS))
    default:
      return message
  }
}

function makeBrowserFallback(payload: string, labels: AppText): PreviewResponse {
  const text = payload.slice(0, 48).replace(/[<>&]/g, '')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="768" viewBox="0 0 768 768"><rect width="768" height="768" fill="#fff"/><rect x="128" y="128" width="512" height="512" rx="16" fill="#f3f4f6"/><text x="384" y="370" text-anchor="middle" font-family="system-ui" font-size="28" fill="#111827">QR Studio</text><text x="384" y="415" text-anchor="middle" font-family="system-ui" font-size="16" fill="#6b7280">${text}</text></svg>`
  return {
    svg,
    stats: { modules: 0, darkModules: 0, density: 0, previewSize: 768, estimatedPngMemoryMb: 2.3 },
    warnings: [labels.browserFallbackWarning],
  }
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function downloadBase64(base64Data: string, mimeType: string, fileName: string) {
  const blob = base64ToBlob(base64Data, mimeType)
  downloadBlob(blob, fileName)
}

function base64ToBlob(base64Data: string, mimeType: string) {
  const byteCharacters = atob(base64Data)
  const chunkSize = 8192
  const chunks: Uint8Array[] = []
  for (let offset = 0; offset < byteCharacters.length; offset += chunkSize) {
    const slice = byteCharacters.slice(offset, offset + chunkSize)
    const bytes = new Uint8Array(slice.length)
    for (let index = 0; index < slice.length; index += 1) {
      bytes[index] = slice.charCodeAt(index)
    }
    chunks.push(bytes)
  }
  const parts = chunks.map((chunk) => {
    const copy = new Uint8Array(new ArrayBuffer(chunk.byteLength))
    copy.set(chunk)
    return copy.buffer
  })
  return new Blob(parts, { type: mimeType })
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default App
