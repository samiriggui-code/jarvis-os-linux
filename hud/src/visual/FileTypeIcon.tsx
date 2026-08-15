/**
 * `<FileTypeIcon type="pdf" />` — glyphes de type de fichier, vendorisés en
 * intégralité (33 SVG, petit set générique, aucun risque esthétique — voir
 * hud/vendor/metronic/README.md). Utile pour une future surface fichiers
 * (FileCard, explorateur, pièces jointes) — aucun appelant aujourd'hui.
 */
import ai from '../../vendor/metronic/file-types/ai.svg';
import apk from '../../vendor/metronic/file-types/apk.svg';
import css from '../../vendor/metronic/file-types/css.svg';
import disc from '../../vendor/metronic/file-types/disc.svg';
import doc from '../../vendor/metronic/file-types/doc.svg';
import excel from '../../vendor/metronic/file-types/excel.svg';
import figma from '../../vendor/metronic/file-types/figma.svg';
import font from '../../vendor/metronic/file-types/font.svg';
import image from '../../vendor/metronic/file-types/image.svg';
import iso from '../../vendor/metronic/file-types/iso.svg';
import javascript from '../../vendor/metronic/file-types/javascript.svg';
import js from '../../vendor/metronic/file-types/js.svg';
import mail from '../../vendor/metronic/file-types/mail.svg';
import mailAlt from '../../vendor/metronic/file-types/mail-1.svg';
import mp3 from '../../vendor/metronic/file-types/mp3.svg';
import music from '../../vendor/metronic/file-types/music.svg';
import pdf from '../../vendor/metronic/file-types/pdf.svg';
import php from '../../vendor/metronic/file-types/php.svg';
import powerpoint from '../../vendor/metronic/file-types/powerpoint.svg';
import ppt from '../../vendor/metronic/file-types/ppt.svg';
import psd from '../../vendor/metronic/file-types/psd.svg';
import record from '../../vendor/metronic/file-types/record.svg';
import sql from '../../vendor/metronic/file-types/sql.svg';
import svg from '../../vendor/metronic/file-types/svg.svg';
import text from '../../vendor/metronic/file-types/text.svg';
import ttf from '../../vendor/metronic/file-types/ttf.svg';
import txt from '../../vendor/metronic/file-types/txt.svg';
import vector from '../../vendor/metronic/file-types/vector.svg';
import video from '../../vendor/metronic/file-types/video.svg';
import videoAlt from '../../vendor/metronic/file-types/video-1.svg';
import word from '../../vendor/metronic/file-types/word.svg';
import xls from '../../vendor/metronic/file-types/xls.svg';
import zip from '../../vendor/metronic/file-types/zip.svg';

const FILES = {
  ai,
  apk,
  css,
  disc,
  doc,
  excel,
  figma,
  font,
  image,
  iso,
  javascript,
  js,
  mail,
  'mail-alt': mailAlt,
  mp3,
  music,
  pdf,
  php,
  powerpoint,
  ppt,
  psd,
  record,
  sql,
  svg,
  text,
  ttf,
  txt,
  vector,
  video,
  'video-alt': videoAlt,
  word,
  xls,
  zip,
} satisfies Record<string, string>;

export type FileType = keyof typeof FILES;

export interface FileTypeIconProps {
  type: FileType;
  size?: number;
  alt?: string;
}

export function FileTypeIcon({ type, size = 24, alt = '' }: FileTypeIconProps) {
  const src = FILES[type];
  if (!src) return null;
  return <img src={src} alt={alt || type} width={size} height={size} style={{ display: 'block' }} />;
}

export default FileTypeIcon;
