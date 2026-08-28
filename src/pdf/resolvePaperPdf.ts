import { downloadPaperFile } from "../api";
import { getPaperPdf, savePaperPdf } from "../storage/paperFiles";

/** IndexedDB 未命中时从服务端 paper_files 拉取 PDF，并缓存到本地。 */
export async function resolvePaperPdf(paperId: string, fileName?: string): Promise<Blob | null> {
  const cached = await getPaperPdf(paperId);
  if (cached) return cached;
  const remote = await downloadPaperFile(paperId);
  if (!remote) return null;
  await savePaperPdf(paperId, new File([remote], fileName ?? `${paperId}.pdf`, { type: "application/pdf" }));
  return remote;
}
