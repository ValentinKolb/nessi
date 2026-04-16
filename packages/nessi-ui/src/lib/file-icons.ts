import { fileIcons } from "@valentinkolb/stdlib";

export const getFileIcon = (filename: string) => {
  const cls = fileIcons.getFileIcon({ name: filename, type: "file" });
  // Strip Tailwind color classes, keep only the icon class
  return cls.split(" ").filter(c => c.startsWith("ti-")).join(" ");
};
