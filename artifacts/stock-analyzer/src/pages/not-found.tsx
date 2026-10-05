import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Waves } from "lucide-react";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="dark min-h-screen w-full flex items-center justify-center bg-[#020c14] text-[#d8e3fb]">
      <Card className="w-full max-w-md mx-4 glass-card">
        <CardContent className="py-10 text-center">
          <div className="flex justify-center mb-5">
            <Waves className="h-10 w-10 text-primary" />
          </div>
          <p className="text-[10px] uppercase tracking-[0.25em] text-primary font-mono">Depth unknown</p>
          <h1 className="text-3xl font-light mt-2">404 — Nothing below</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            This Deepberg route does not exist.
          </p>
          <Link href="/" className="inline-flex items-center gap-2 mt-6 text-sm text-primary hover:text-primary/80">
            <ArrowLeft className="h-4 w-4" /> Return to the surface
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
