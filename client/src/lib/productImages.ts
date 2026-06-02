export async function loadImageDataUrl(imagePath: string): Promise<string> {
  const response = await fetch(new URL(imagePath, window.location.origin).href);
  if (!response.ok) {
    throw new Error(`Could not load image: ${imagePath}`);
  }

  const blob = await response.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Could not read image: ${imagePath}`));
    reader.readAsDataURL(blob);
  });
}
