import { Suspense } from "react";
import TimeTravelClient from "./TimeTravelClient";

export const metadata = { title: "Time Travel · COSMOS" };

export default function TimeTravelPage() {
  return (
    <Suspense fallback={null}>
      <TimeTravelClient />
    </Suspense>
  );
}
