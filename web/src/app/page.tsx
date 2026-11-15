import Link from "next/link";
export default function Home() {
  return (
    <main className="grid min-h-screen place-items-center">
      <Link href="/explore" className="btn btn-primary">Explore the infrared sky →</Link>
    </main>
  );
}
