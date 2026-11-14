"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";

import { api } from "../../../../convex/_generated/api";

export default function ProjectsPage() {
  const projects = useQuery(api.projects.list);
  const createProject = useMutation(api.projects.create);

  const [name, setName] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [baseBranch, setBaseBranch] = useState("main");

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    await createProject({
      name,
      repoUrl,
      baseBranch,
    });

    setName("");
    setRepoUrl("");
    setBaseBranch("main");
  }

  return (
    <main>
      <h1>Projects</h1>

      <form onSubmit={submit}>
        <input
          placeholder="Project name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <input
          placeholder="GitHub repository URL"
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
        />

        <input
          placeholder="Base branch"
          value={baseBranch}
          onChange={(e) => setBaseBranch(e.target.value)}
        />

        <button type="submit">Add project</button>
      </form>

      <ul>
        {projects?.map((project) => (
          <li key={project._id}>
            {project.name} — {project.repoUrl}
          </li>
        ))}
      </ul>
    </main>
  );
}
