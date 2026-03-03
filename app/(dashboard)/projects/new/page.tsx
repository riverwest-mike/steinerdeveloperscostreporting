import { Header } from "@/components/layout/header";
import { ProjectForm } from "../project-form";

export default function NewProjectPage() {
  return (
    <div>
      <Header title="New Project" />
      <div className="p-6 max-w-3xl">
        <div className="mb-6">
          <h2 className="text-2xl font-bold tracking-tight">Create Project</h2>
          <p className="text-muted-foreground mt-1">
            Add a new development project. The project code must be unique and will appear on all reports.
          </p>
        </div>
        <div className="rounded-lg border p-6 bg-card">
          <ProjectForm appfolioBaseUrl={process.env.APPFOLIO_DATABASE_URL} />
        </div>
      </div>
    </div>
  );
}
