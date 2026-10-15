import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import bg from "@/assets/crystal-bg.jpg";
import { Button } from "@/components/ui/button";
import { getBrandMetadata } from "@/lib/brand.functions";

export const Route = createFileRoute("/auth")({
  loader: () => getBrandMetadata(),
  head: ({ loaderData }) => ({
    meta: [
      { title: "Sign in — CoralzOne" },
      { name: "description", content: "Sign in or create your CoralzOne account." },
      { property: "og:title", content: "Sign in — CoralzOne" },
      { property: "og:description", content: "Sign in or create your CoralzOne account." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${loaderData?.origin ?? ""}/auth` },
      ...(loaderData?.socialImage ? [
        { property: "og:image", content: loaderData.socialImage },
        { name: "twitter:image", content: loaderData.socialImage },
      ] : []),
      { property: "og:image:alt", content: "CoralzOne royal-blue crystal logo" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: `${loaderData?.origin ?? ""}/auth` }],
  }),
  component: Auth,
});

function Auth() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  return (
    <div className="relative flex min-h-screen items-center justify-center px-5">
      <img src={bg} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover" />
      <div className="absolute inset-0 -z-10 bg-overlay" />
      <div className="glass-card w-full max-w-sm p-8">
        <Link to="/" className="font-display text-lg font-normal text-foreground">CoralzOne</Link>
        <h1 className="mt-4 font-display text-3xl font-normal text-foreground">
          {mode === "login" ? "Welcome back" : "Create account"}
        </h1>
        <form className="mt-6 space-y-3" onSubmit={(e) => e.preventDefault()}>
          {mode === "signup" && <input className="glass-input" placeholder="Name" />}
          <input className="glass-input" type="email" placeholder="Email" />
          <input className="glass-input" type="password" placeholder="Password" />
          <Button variant="crystal" className="h-auto w-full py-3 font-semibold">{mode === "login" ? "Sign in" : "Sign up"}</Button>
          <Button variant="glass" type="button" className="h-auto w-full rounded-full py-3 text-sm">Continue with Google</Button>
        </form>
        <Button variant="ghost"
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
          className="mt-5 w-full text-center text-sm text-muted-foreground"
        >
          {mode === "login" ? "New here? Create an account" : "Have an account? Sign in"}
        </Button>
      </div>
    </div>
  );
}
