import { generateReactHelpers } from "@uploadthing/react";
import type { UploadRouter } from "../uploadthing";

export const { useUploadThing } = generateReactHelpers<UploadRouter>({
  url: "/api/uploadthing",
});
