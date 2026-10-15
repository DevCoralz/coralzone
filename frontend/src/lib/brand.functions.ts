import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import socialAsset from "@/assets/coralzone-social.jpg.asset.json";

export const getBrandMetadata = createServerFn({ method: "GET" }).handler(() => {
  const request = getRequest();
  const url = new URL(request.url);
  const forwardedHost = url.hostname === "localhost" ? request.headers.get("x-forwarded-host") : null;
  const origin = forwardedHost ? `https://${forwardedHost}` : url.origin;
  return { origin, socialImage: new URL(socialAsset.url, origin).href };
});