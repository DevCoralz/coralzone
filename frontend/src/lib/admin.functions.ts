// Admin gate for /admin routes.
// A user is an admin when their signed-in email matches the ADMIN_EMAIL
// environment variable (set by the owner). Everyone else is rejected and
// the route throws notFound() so non-admins only ever see the 404 page.
import { createServerFn } from "@tanstack/react-start";
import { getSession } from "./auth-session.functions";

export const getIsAdmin = createServerFn({ method: "GET" }).handler(async (): Promise<boolean> => {
  const adminEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  if (!adminEmail) return false;
  const user = await getSession();
  if (!user?.email) return false;
  return user.email.trim().toLowerCase() === adminEmail;
});
