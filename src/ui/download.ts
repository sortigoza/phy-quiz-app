/**
 * Hands the browser a file to save, without any server: the text becomes a
 * blob URL, and a link to it with a `download` name is clicked.
 */
export function saveFile(filename: string, text: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  // After the click has handed the blob to the download, so it is not revoked mid-save.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
