declare module "pdfjs-dist/build/pdf.mjs" {
  export const GlobalWorkerOptions: {
    workerSrc: string;
  };

  export function getDocument(src: { data: Uint8Array }): {
    promise: Promise<{
      numPages: number;
      getPage(pageNumber: number): Promise<{
        getTextContent(): Promise<{
          items: Array<{ str?: string }>;
        }>;
      }>;
      destroy(): void;
    }>;
  };
}
