type UploadApiOptions<T> = {
  url: string;
  file: File;
  accessToken: string;
  fields?: Record<string, string>;
  headers?: Record<string, string>;
  onProgress?: (progress: number) => void;
};

export function uploadFileToApi<T>({
  url,
  file,
  accessToken,
  fields,
  headers,
  onProgress,
}: UploadApiOptions<T>) {
  return new Promise<T>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', url);
    request.responseType = 'json';
    request.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    if (headers) {
      for (const [name, value] of Object.entries(headers)) {
        request.setRequestHeader(name, value);
      }
    }

    request.upload.addEventListener('progress', (event) => {
      if (!event.lengthComputable || !onProgress) {
        return;
      }

      onProgress(Math.round((event.loaded / event.total) * 100));
    });

    request.addEventListener('load', () => {
      const response = request.response as { error?: string } | null;

      if (request.status >= 200 && request.status < 300) {
        resolve((response ?? undefined) as T);
        return;
      }

      reject(new Error(response?.error || request.statusText || 'Upload failed'));
    });

    request.addEventListener('error', () => {
      reject(new Error('Upload failed'));
    });

    const formData = new FormData();
    formData.append('file', file);
    if (fields) {
      for (const [name, value] of Object.entries(fields)) {
        formData.append(name, value);
      }
    }
    request.send(formData);
  });
}
