import { Suspense } from "react";
import FlyClient from "./FlyClient";

export const metadata = { title: "Fly · COSMOS" };

export default function FlyPage() {
  return (
    <Suspense fallback={null}>
      <FlyClient />
    </Suspense>
  );
}
