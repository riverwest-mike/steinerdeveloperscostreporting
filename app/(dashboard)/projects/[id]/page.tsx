export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { ProjectDetail } from "./project-detail";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProjectPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();

  if (!project) notFound();

  return (
    <div>
      <Header title={project.name} />
      <div className="p-6">
        {/* Breadcrumb */}
        <nav className="text-sm text-muted-foreground mb-4">
          <Link href="/projects" className="hover:text-foreground transition-colors">
            Projects
          </Link>
          <span className="mx-2">/</span>
          <span className="text-foreground font-medium">{project.name}</span>
        </nav>

        <ProjectDetail project={project} />
      </div>
    </div>
  );
}
