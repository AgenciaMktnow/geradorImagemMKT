import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Download,
  ImagePlus,
  Loader2,
  LogOut,
  Moon,
  RefreshCcw,
  Sparkles,
  Sun,
  Trash2,
  UploadCloud,
  WandSparkles
} from "lucide-react";
import { FILE_BASE_URL, api, getToken, setToken } from "./api/client.js";
import "./styles/app.css";

const emptyPrompt = {
  scenario: "",
  style: "",
  pose: "",
  extraInstructions: "",
  negativePrompt: ""
};

function App() {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(Boolean(getToken()));

  useEffect(() => {
    if (!getToken()) return;
    api.me()
      .then((data) => setUser(data.user))
      .catch(() => setToken(null))
      .finally(() => setBooting(false));
  }, []);

  if (booting) return <FullScreenLoading />;
  if (!user) return <AuthPage onAuthed={setUser} />;
  return <Studio user={user} onLogout={() => { setToken(null); setUser(null); }} />;
}

function FullScreenLoading() {
  return (
    <main className="center-screen">
      <Loader2 className="spin" size={28} />
    </main>
  );
}

function AuthPage({ onAuthed }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const payload = {
        email: form.email.trim(),
        password: form.password
      };
      if (mode === "register") payload.name = form.name.trim();
      const data = mode === "register" ? await api.register(payload) : await api.login(payload);
      setToken(data.token);
      onAuthed(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-panel">
        <div className="brand-row">
          <img className="brand-logo" src="/studionow-logo.png" alt="StudioNow" />
          <div>
            <p>Modelo, produtos e formatos de campanha em um fluxo.</p>
          </div>
        </div>

        <div className="segmented">
          <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Login</button>
          <button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>Cadastro</button>
        </div>

        <form onSubmit={submit} className="form-stack">
          {mode === "register" && (
            <label>
              Nome
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </label>
          )}
          <label>
            Email
            <input type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          </label>
          <label>
            Senha
            <input type="password" required minLength="8" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="primary-button" disabled={loading}>
            {loading ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
            {mode === "register" ? "Criar conta" : "Entrar"}
          </button>
        </form>
      </section>
    </main>
  );
}

function Studio({ user, onLogout }) {
  const [projects, setProjects] = useState([]);
  const [presets, setPresets] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [generations, setGenerations] = useState([]);
  const [selectedGenerationId, setSelectedGenerationId] = useState(null);
  const [selectedGeneration, setSelectedGeneration] = useState(null);
  const [toolMode, setToolMode] = useState("model");
  const [error, setError] = useState("");
  const [theme, setTheme] = useState(() => localStorage.getItem("studio_theme") ?? "dark");

  useEffect(() => {
    localStorage.setItem("studio_theme", theme);
  }, [theme]);

  async function refreshAll() {
    const [projectData, presetData] = await Promise.all([api.listProjects(), api.listPresets()]);
    setProjects(projectData.projects);
    setPresets(presetData.presets);
    const projectId = selectedProjectId || projectData.projects[0]?.id || "";
    if (!selectedProjectId && projectId) setSelectedProjectId(projectId);
    if (projectId) {
      const generationData = await api.listGenerations(projectId);
      setGenerations(generationData.generations);
    }
  }

  useEffect(() => {
    refreshAll().catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!selectedProjectId) return;
    api.listGenerations(selectedProjectId).then((data) => setGenerations(data.generations)).catch((err) => setError(err.message));
  }, [selectedProjectId]);

  useEffect(() => {
    const interval = setInterval(async () => {
      if (selectedProjectId) {
        const data = await api.listGenerations(selectedProjectId);
        setGenerations(data.generations);
      }
      if (selectedGenerationId) {
        const data = await api.getGeneration(selectedGenerationId);
        setSelectedGeneration(data);
      }
    }, 2500);
    return () => clearInterval(interval);
  }, [selectedProjectId, selectedGenerationId]);

  async function openGeneration(id) {
    setSelectedGenerationId(id);
    setSelectedGeneration(await api.getGeneration(id));
  }

  async function deleteGeneration(id) {
    const generation = generations.find((item) => item.id === id);
    const createdAt = generation ? new Date(generation.created_at).toLocaleString("pt-BR") : "selecionado";
    if (!window.confirm(`Excluir este item do histórico (${createdAt})?`)) return;

    await api.deleteGeneration(id);
    if (selectedGenerationId === id) {
      setSelectedGenerationId(null);
      setSelectedGeneration(null);
    }
    const data = await api.listGenerations(selectedProjectId);
    setGenerations(data.generations);
  }

  async function onCreated(generation) {
    setSelectedGenerationId(generation.id);
    setSelectedGeneration(await api.getGeneration(generation.id));
    const data = await api.listGenerations(selectedProjectId);
    setGenerations(data.generations);
  }

  async function refreshPresets() {
    const data = await api.listPresets();
    setPresets(data.presets);
  }

  return (
    <main className="app-shell" data-theme={theme}>
      <header className="topbar">
        <div className="brand-row compact">
          <img className="brand-logo compact" src="/studionow-logo.png" alt="StudioNow" />
          <div>
            <p>{user.email}</p>
          </div>
        </div>
        <div className="topbar-actions">
          <button
            className="theme-toggle"
            type="button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label={theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}
          >
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            {theme === "dark" ? "Modo claro" : "Modo escuro"}
          </button>
          <button className="ghost-button" onClick={onLogout}><LogOut size={18} /> Sair</button>
        </div>
      </header>

      {error && <div className="notice error">{error}</div>}

      <section className="workspace-grid">
        <aside className="sidebar">
          <ProjectPicker
            projects={projects}
            selectedProjectId={selectedProjectId}
            setSelectedProjectId={setSelectedProjectId}
            onProjectCreated={(project) => {
              setProjects([project, ...projects]);
              setSelectedProjectId(project.id);
            }}
          />
          <GenerationList
            generations={generations}
            selectedId={selectedGenerationId}
            onOpen={openGeneration}
            onDelete={deleteGeneration}
          />
        </aside>

        <section className="main-column">
          <div className="tool-tabs">
            <button className={toolMode === "model" ? "active" : ""} onClick={() => setToolMode("model")}>
              <Sparkles size={20} />
              <span>
                <strong>Modelo + produtos</strong>
                <small>Crie uma imagem nova a partir de referências.</small>
              </span>
            </button>
            <button className={toolMode === "banner" ? "active" : ""} onClick={() => setToolMode("banner")}>
              <ImagePlus size={20} />
              <span>
                <strong>Desdobrar banner</strong>
                <small>Adapte uma peça pronta para outros formatos.</small>
              </span>
            </button>
          </div>
          {toolMode === "model" ? (
            <GenerationForm projectId={selectedProjectId} presets={presets} onCreated={onCreated} />
          ) : (
            <BannerUnfoldForm
              projectId={selectedProjectId}
              presets={presets}
              onCreated={onCreated}
              onPresetCreated={refreshPresets}
            />
          )}
          {selectedGeneration && (
            <GenerationDetail
              data={selectedGeneration}
              presets={presets}
              onRefresh={() => openGeneration(selectedGeneration.generation.id)}
            />
          )}
        </section>
      </section>
    </main>
  );
}

function PresetSelector({ presets, selectedPresetIds, setSelectedPresetIds }) {
  const groupedPresets = presets.reduce((groups, preset) => {
    const key = preset.is_custom ? "Custom" : preset.channel;
    groups[key] = groups[key] ?? [];
    groups[key].push(preset);
    return groups;
  }, {});

  return (
    <div className="preset-groups">
      {Object.entries(groupedPresets).map(([group, groupPresets]) => (
        <section className="preset-group" key={group}>
          <h4>{group}</h4>
          <div className="preset-grid">
            {groupPresets.map((preset) => (
              <label className="preset-chip" key={preset.id}>
                <input
                  type="checkbox"
                  checked={selectedPresetIds.includes(preset.id)}
                  onChange={(event) => {
                    setSelectedPresetIds((current) => event.target.checked
                      ? [...current, preset.id]
                      : current.filter((id) => id !== preset.id));
                  }}
                />
                <span>{preset.name}</span>
                <small>{preset.width}x{preset.height}{preset.is_custom ? " custom" : ""}</small>
              </label>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function FileDrop({ label, helper, file, multiple = false, onChange }) {
  return (
    <label className={`drop-field ${file ? "has-file" : ""}`}>
      <UploadCloud size={22} />
      <span>{label}</span>
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple={multiple}
        onChange={onChange}
      />
      <small>{file ? file : helper}</small>
    </label>
  );
}

function CustomPresetForm({ onCreated }) {
  const [preset, setPreset] = useState({ name: "", width: "", height: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.createPreset({
        name: preset.name,
        width: Number(preset.width),
        height: Number(preset.height),
        channel: "custom"
      });
      setPreset({ name: "", width: "", height: "" });
      await onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="custom-preset-form" onSubmit={submit}>
      <label>Nome<input required value={preset.name} onChange={(event) => setPreset({ ...preset, name: event.target.value })} placeholder="Ex: Banner marketplace" /></label>
      <label>Largura<input required type="number" min="128" max="8192" value={preset.width} onChange={(event) => setPreset({ ...preset, width: event.target.value })} placeholder="1600" /></label>
      <label>Altura<input required type="number" min="128" max="8192" value={preset.height} onChange={(event) => setPreset({ ...preset, height: event.target.value })} placeholder="900" /></label>
      <button className="ghost-button" disabled={loading}>{loading ? <Loader2 className="spin" size={16} /> : <ImagePlus size={16} />} Adicionar</button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

function ProjectPicker({ projects, selectedProjectId, setSelectedProjectId, onProjectCreated }) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  async function createProject(event) {
    event.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      const data = await api.createProject({ name });
      onProjectCreated(data.project);
      setName("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel">
      <h2>Projetos</h2>
      <select value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}>
        <option value="">Selecione</option>
        {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
      </select>
      <form className="inline-form" onSubmit={createProject}>
        <input placeholder="Novo projeto" value={name} onChange={(event) => setName(event.target.value)} />
        <button className="icon-button" title="Criar projeto" disabled={loading}><ImagePlus size={18} /></button>
      </form>
    </section>
  );
}

function GenerationList({ generations, selectedId, onOpen, onDelete }) {
  const [filter, setFilter] = useState("all");
  const [deletingId, setDeletingId] = useState(null);
  const filteredGenerations = generations.filter((generation) => filter === "all" || generation.status === filter);

  async function deleteItem(generationId) {
    setDeletingId(generationId);
    try {
      await onDelete(generationId);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="panel generation-list">
      <div className="sidebar-heading">
        <h2>Histórico</h2>
        <span>{generations.length}</span>
      </div>
      <div className="history-filters">
        <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Todos</button>
        <button className={filter === "completed" ? "active" : ""} onClick={() => setFilter("completed")}>OK</button>
        <button className={filter === "failed" ? "active" : ""} onClick={() => setFilter("failed")}>Falhou</button>
      </div>
      {filteredGenerations.length === 0 && <p className="muted">Nenhuma geração neste filtro.</p>}
      {filteredGenerations.map((generation) => (
        <div
          className={`history-item ${selectedId === generation.id ? "active" : ""}`}
          key={generation.id}
        >
          <button className="history-open" type="button" onClick={() => onOpen(generation.id)}>
            {generation.baseUrl ? <img src={`${FILE_BASE_URL}${generation.baseUrl}`} alt="" /> : <div className="thumb-placeholder" />}
            <span>
              <strong>{statusLabel(generation.status)}</strong>
              <small>{new Date(generation.created_at).toLocaleString("pt-BR")}</small>
            </span>
          </button>
          <button
            className="history-delete"
            type="button"
            title="Excluir do histórico"
            aria-label="Excluir do histórico"
            disabled={deletingId === generation.id || generation.status === "processing"}
            onClick={(event) => {
              event.stopPropagation();
              deleteItem(generation.id).catch((err) => alert(err.message));
            }}
          >
            {deletingId === generation.id ? <Loader2 className="spin" size={15} /> : <Trash2 size={15} />}
          </button>
        </div>
      ))}
    </section>
  );
}

function GenerationForm({ projectId, presets, onCreated }) {
  const [prompt, setPrompt] = useState(emptyPrompt);
  const [model, setModel] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    const generationForm = event.currentTarget;
    setError("");
    if (!projectId) return setError("Crie ou selecione um projeto.");
    if (!model) return setError("Envie uma imagem de modelo.");
    if (!products.length) return setError("Envie pelo menos uma imagem de produto.");

    const formData = new FormData();
    formData.append("projectId", projectId);
    formData.append("prompt", JSON.stringify(prompt));
    formData.append("model", model);
    products.slice(0, 5).forEach((file) => formData.append("products", file));

    setLoading(true);
    try {
      const data = await api.createGeneration(formData);
      setPrompt(emptyPrompt);
      setModel(null);
      setProducts([]);
      generationForm.reset();
      await onCreated(data.generation);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel create-panel">
      <div className="section-heading">
        <div>
          <h2>Nova geração</h2>
          <p>Envie 1 modelo e até 5 produtos.</p>
        </div>
        <span className="pill">{presets.length} presets</span>
      </div>
      <form className="generation-form" onSubmit={submit}>
        <div className="flow-grid">
          <section className="flow-card">
            <span className="step-label">01 · Assets</span>
            <div className="upload-grid">
              <FileDrop
                label="Imagem do modelo"
                helper="PNG, JPG ou WebP"
                file={model?.name}
                onChange={(event) => setModel(event.target.files?.[0] ?? null)}
              />
              <FileDrop
                label="Produtos"
                helper="Até 5 imagens"
                file={products.length ? `${products.length} arquivo(s)` : ""}
                multiple
                onChange={(event) => setProducts(Array.from(event.target.files ?? []).slice(0, 5))}
              />
            </div>
          </section>

          <section className="flow-card">
            <span className="step-label">02 · Direção criativa</span>
            <div className="prompt-grid">
              <label>Cenário<input value={prompt.scenario} onChange={(event) => setPrompt({ ...prompt, scenario: event.target.value })} placeholder="Estúdio minimalista, fundo claro" /></label>
              <label>Estilo<input value={prompt.style} onChange={(event) => setPrompt({ ...prompt, style: event.target.value })} placeholder="Editorial premium, e-commerce clean" /></label>
              <label>Pose/composição<input value={prompt.pose} onChange={(event) => setPrompt({ ...prompt, pose: event.target.value })} placeholder="Modelo em pé, produto em destaque" /></label>
              <label>Evitar<input value={prompt.negativePrompt} onChange={(event) => setPrompt({ ...prompt, negativePrompt: event.target.value })} placeholder="Mãos distorcidas, produto deformado" /></label>
            </div>
            <label>Instruções extras<textarea value={prompt.extraInstructions} onChange={(event) => setPrompt({ ...prompt, extraInstructions: event.target.value })} placeholder="Detalhes de iluminação, enquadramento, campanha ou marca." /></label>
          </section>
        </div>

        {error && <p className="error">{error}</p>}
        <button className="primary-button" disabled={loading}>
          {loading ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
          Gerar imagem principal
        </button>
      </form>
    </section>
  );
}

function BannerUnfoldForm({ projectId, presets, onCreated, onPresetCreated }) {
  const [banner, setBanner] = useState(null);
  const [selectedPresetIds, setSelectedPresetIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    const bannerForm = event.currentTarget;
    setError("");
    if (!projectId) return setError("Crie ou selecione um projeto.");
    if (!banner) return setError("Envie o banner pronto.");
    if (!selectedPresetIds.length) return setError("Escolha pelo menos um desdobramento.");

    const formData = new FormData();
    formData.append("projectId", projectId);
    formData.append("banner", banner);
    formData.append("unfold", JSON.stringify({ presetIds: selectedPresetIds }));

    setLoading(true);
    try {
      const data = await api.createBannerUnfold(formData);
      setBanner(null);
      setSelectedPresetIds([]);
      bannerForm.reset();
      await onCreated(data.generation);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel create-panel">
      <div className="section-heading">
        <div>
          <h2>Desdobrar banner</h2>
          <p>Envie um banner pronto e gere variações em outros formatos.</p>
        </div>
        <span className="pill">{presets.length} presets</span>
      </div>
      <form className="generation-form" onSubmit={submit}>
        <div className="flow-grid">
          <section className="flow-card">
            <span className="step-label">01 · Peça original</span>
            <FileDrop
              label="Banner pronto"
              helper="PNG, JPG ou WebP com texto, foto e layout final"
              file={banner?.name}
              onChange={(event) => setBanner(event.target.files?.[0] ?? null)}
            />
          </section>

          <section className="flow-card">
            <span className="step-label">02 · Formatos</span>
            <div className="section-heading compact-heading">
              <div>
                <h3>Desdobramentos</h3>
                <p>Escolha formatos existentes ou adicione um tamanho próprio.</p>
              </div>
            </div>
            <PresetSelector presets={presets} selectedPresetIds={selectedPresetIds} setSelectedPresetIds={setSelectedPresetIds} />

            <div className="custom-preset-box">
              <h3>Adicionar desdobramento</h3>
              <CustomPresetForm onCreated={onPresetCreated} />
            </div>
          </section>
        </div>

        {error && <p className="error">{error}</p>}
        <button className="primary-button" disabled={loading}>
          {loading ? <Loader2 className="spin" size={18} /> : <WandSparkles size={18} />}
          Gerar desdobramentos
        </button>
      </form>
    </section>
  );
}

function GenerationDetail({ data, presets, onRefresh }) {
  const [selectedPresetIds, setSelectedPresetIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [busyResultId, setBusyResultId] = useState("");
  const { generation, results, jobs } = data;
  const baseResult = results.find((result) => result.kind === "base");
  const unfoldResults = results.filter((result) => result.kind === "unfold");
  const completedPresetNames = new Set(unfoldResults.map((result) => result.presetName));
  const completedJobs = jobs.filter((job) => job.status === "completed").length;
  const hasActiveJobs = jobs.some((job) => job.status === "processing" || job.status === "pending");
  const progress = jobs.length ? Math.round((completedJobs / jobs.length) * 100) : 0;

  const availablePresets = useMemo(
    () => presets.filter((preset) => !completedPresetNames.has(preset.name)),
    [presets, unfoldResults.length]
  );

  async function unfold() {
    setLoading(true);
    try {
      await api.unfoldGeneration(generation.id, selectedPresetIds);
      setSelectedPresetIds([]);
      await onRefresh();
    } finally {
      setLoading(false);
    }
  }

  async function regenerateBase() {
    setRegenerating(true);
    try {
      await api.regenerateBase(generation.id);
      await onRefresh();
    } finally {
      setRegenerating(false);
    }
  }

  async function regenerateUnfold(result) {
    setBusyResultId(result.id);
    try {
      await api.regenerateResult(generation.id, result.id);
      await onRefresh();
    } finally {
      setBusyResultId("");
    }
  }

  async function deleteUnfold(result) {
    if (!window.confirm(`Apagar "${result.presetName}"?`)) return;
    setBusyResultId(result.id);
    try {
      await api.deleteResult(generation.id, result.id);
      await onRefresh();
    } finally {
      setBusyResultId("");
    }
  }

  return (
    <section className="panel results-panel">
      <div className="section-heading">
        <div>
          <h2>Resultado</h2>
          <p>{statusLabel(generation.status)} · {completedJobs}/{jobs.length} jobs concluídos</p>
        </div>
        <div className="result-actions">
          {generation.model_asset_id && (
            <button className="ghost-button" onClick={regenerateBase} disabled={regenerating || generation.status === "processing"}>
              {regenerating ? <Loader2 className="spin" size={18} /> : <WandSparkles size={18} />}
              Gerar novamente
            </button>
          )}
          <button className="ghost-button" onClick={onRefresh}><RefreshCcw size={18} /> Atualizar</button>
        </div>
      </div>

      <div className="result-layout">
        <div className={`preview-area ${hasActiveJobs ? "is-processing" : ""}`}>
          {baseResult ? (
            <>
              <ResultImage result={baseResult} />
              {hasActiveJobs && <ProcessingOverlay />}
            </>
          ) : (
            <div className="empty-preview">
              <ProcessingSteps />
              <span>Aguardando imagem principal</span>
            </div>
          )}
        </div>

        <aside className="jobs-panel">
          <div className="jobs-header">
            <h3>Jobs</h3>
            <span>{progress}%</span>
          </div>
          <div className="progress-track"><div style={{ width: `${progress}%` }} /></div>
          {jobs.map((job) => (
            <div className={`job-row ${job.status}`} key={job.id}>
              <span>{job.preset_name ?? "Imagem principal"}</span>
              <strong className={`status ${job.status}`}>{statusLabel(job.status)}</strong>
              {job.error && <p className="job-error">{friendlyJobError(job.error)}</p>}
              {job.status === "failed" && <button onClick={() => api.retryJob(job.id).then(onRefresh)}>Retry</button>}
            </div>
          ))}
        </aside>
      </div>

      {generation.status === "completed" && (
        <div className="unfold-box">
          <div className="section-heading">
            <div>
              <h3>Desdobramentos</h3>
              <p>Gere novas composições por canal usando IA.</p>
            </div>
            <button className="primary-button small" disabled={!selectedPresetIds.length || loading} onClick={unfold}>
              {loading ? <Loader2 className="spin" size={16} /> : <WandSparkles size={16} />}
              Desdobrar
            </button>
          </div>
          <PresetSelector presets={availablePresets} selectedPresetIds={selectedPresetIds} setSelectedPresetIds={setSelectedPresetIds} />
        </div>
      )}

      {unfoldResults.length > 0 && (
        <div className="gallery-grid">
          {unfoldResults.map((result) => (
            <ResultImage
              key={result.id}
              result={result}
              busy={busyResultId === result.id}
              onRegenerate={() => regenerateUnfold(result)}
              onDelete={() => deleteUnfold(result)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ProcessingOverlay() {
  return (
    <div className="processing-overlay">
      <ProcessingSteps />
      <strong>Refinando composição</strong>
      <span>Preservando referências e renderizando variações.</span>
    </div>
  );
}

function ProcessingSteps() {
  return (
    <div className="processing-steps" aria-label="Processando">
      <span />
      <span />
      <span />
    </div>
  );
}

function ResultImage({ result, onRegenerate, onDelete, busy = false }) {
  const [loaded, setLoaded] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const url = `${FILE_BASE_URL}${result.asset.url}`;
  const title = result.presetName ?? "Imagem principal";
  const dimensions = result.asset.width && result.asset.height ? `${result.asset.width}x${result.asset.height}` : "original";
  const filename = `${slugify(title)}-${dimensions}.${extensionForMime(result.asset.mimeType)}`;

  async function downloadImage() {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Nao foi possivel baixar a imagem");
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 1600);
  }

  return (
    <>
      <figure className={`result-card ${loaded ? "loaded" : ""}`}>
        <button className="image-button" type="button" onClick={() => setLightboxOpen(true)}>
          <img src={url} alt={title} onLoad={() => setLoaded(true)} />
        </button>
        <figcaption>
          <span>
            <strong>{title}</strong>
            <small>{dimensions}</small>
          </span>
          <div className="result-card-actions">
            {onRegenerate && (
              <button className="icon-button" type="button" onClick={onRegenerate} disabled={busy} title={`Gerar novamente ${title}`}>
                {busy ? <Loader2 className="spin" size={18} /> : <RefreshCcw size={18} />}
              </button>
            )}
            {onDelete && (
              <button className="icon-button danger" type="button" onClick={onDelete} disabled={busy} title={`Apagar ${title}`}>
                <Trash2 size={18} />
              </button>
            )}
            <button className="icon-button" type="button" onClick={downloadImage} title={`Baixar ${filename}`}>
              {downloaded ? "OK" : <Download size={18} />}
            </button>
          </div>
        </figcaption>
      </figure>
      {lightboxOpen && (
        <div className="lightbox" onClick={() => setLightboxOpen(false)}>
          <button className="lightbox-close" type="button">Fechar</button>
          <img src={url} alt={title} />
        </div>
      )}
    </>
  );
}

function slugify(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function extensionForMime(mimeType) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/svg+xml") return "svg";
  return "jpg";
}

function statusLabel(status) {
  return {
    pending: "Pendente",
    processing: "Processando",
    completed: "Concluído",
    failed: "Falhou"
  }[status] ?? status;
}

function friendlyJobError(error) {
  if (error.includes("quota") || error.includes("Quota") || error.includes("RESOURCE_EXHAUSTED")) {
    return "Cota da API Gemini excedida ou indisponível para este projeto. Verifique faturamento e limites no Google AI Studio.";
  }
  if (error.includes("API key") || error.includes("API_KEY")) {
    return "Chave da Gemini ausente ou inválida.";
  }
  return error.length > 220 ? `${error.slice(0, 220)}...` : error;
}

createRoot(document.getElementById("root")).render(<App />);
