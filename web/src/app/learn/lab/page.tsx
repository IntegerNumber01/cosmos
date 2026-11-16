import NavBar from "@/components/NavBar";
import LearningLab from "./LearningLab";

export const metadata = { title: "Would you believe this change? · COSMOS", description: "Investigate three real SPHEREx image pairs. Learn to distinguish a supported brightness change, an inconclusive result and an unreliable measurement." };

export default function LabPage() {
  return <main className="min-h-screen bg-bg pb-20"><NavBar /><div className="mx-auto max-w-[1000px] px-5 pt-24 sm:px-8"><LearningLab /></div></main>;
}
