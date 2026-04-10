const EXT_TO_ICON: Record<string, string> = {
  // documents
  pdf: "ti-file-type-pdf",
  doc: "ti-file-type-doc",
  docx: "ti-file-type-docx",
  ppt: "ti-file-type-ppt",
  pptx: "ti-file-type-ppt",
  // spreadsheets
  xls: "ti-file-type-xls",
  xlsx: "ti-file-type-xls",
  csv: "ti-table",
  tsv: "ti-table",
  // code / text
  txt: "ti-file-type-txt",
  md: "ti-markdown",
  json: "ti-json",
  xml: "ti-file-type-xml",
  html: "ti-brand-html5",
  css: "ti-brand-css3",
  js: "ti-brand-javascript",
  jsx: "ti-brand-javascript",
  ts: "ti-brand-typescript",
  tsx: "ti-brand-typescript",
  py: "ti-brand-python",
  rs: "ti-brand-rust",
  go: "ti-brand-golang",
  sql: "ti-sql",
  yaml: "ti-file-type-txt",
  yml: "ti-file-type-txt",
  toml: "ti-file-type-txt",
  // images
  svg: "ti-file-vector",
  png: "ti-photo",
  jpg: "ti-photo",
  jpeg: "ti-photo",
  gif: "ti-photo",
  webp: "ti-photo",
  ico: "ti-photo-circle",
  // archives
  zip: "ti-zip",
  tar: "ti-zip",
  gz: "ti-zip",
};

export const getFileIcon = (filename: string) => {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_ICON[ext] ?? "ti-file";
};
