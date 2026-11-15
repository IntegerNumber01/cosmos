import { Suspense } from "react";
import ExploreClient from "./ExploreClient";

export const metadata = { title: "Explore · COSMOS" };

export default function ExplorePage() {
  return (
    <Suspense fallback={null}>
      <ExploreClient />
    </Suspense>
  );
}
