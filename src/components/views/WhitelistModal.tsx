import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ShieldCheck,
  Plus,
  Trash2,
  X,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Database,
  UploadCloud,
  FileUp,
  HardDrive,
  FileCheck2,
  Shuffle,
  Edit3,
  Layers,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAppState, useAppDispatch } from '../../state/AppContext';
import { inputClassName } from '../ui/input';
import { PrimaryButton, SecondaryButton } from '../ui/Buttons';
import { loadAppData } from '../../storage/storage';

export interface WhitelistEntryDto {
  id: string;
  email: string;
  role: 'ADMIN' | 'PLAYER';
  playerId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ThemeDto {
  name: string;
  teams: string[];
  isCustom: boolean;
}

interface WhitelistModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WhitelistModal({ isOpen, onClose }: WhitelistModalProps) {
  const { isAdmin } = useAuth();
  const { players } = useAppState();
  const dispatch = useAppDispatch();

  const [entries, setEntries] = useState<WhitelistEntryDto[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Tabs: 'whitelist' | 'migration' | 'themes'
  const [activeTab, setActiveTab] = useState<'whitelist' | 'migration' | 'themes'>('whitelist');

  // Form states
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'PLAYER' | 'ADMIN'>('PLAYER');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('');
  const [isCreatingNewPlayer, setIsCreatingNewPlayer] = useState<boolean>(false);
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');

  // Themes & Teams states
  const [themes, setThemes] = useState<ThemeDto[]>([]);
  const [loadingThemes, setLoadingThemes] = useState<boolean>(false);
  const [themesError, setThemesError] = useState<string | null>(null);
  const [themesSuccess, setThemesSuccess] = useState<string | null>(null);
  const [selectedThemeName, setSelectedThemeName] = useState<string>('');
  const [themeFormName, setThemeFormName] = useState<string>('');
  const [themeFormTeamsText, setThemeFormTeamsText] = useState<string>('');
  const [savingTheme, setSavingTheme] = useState<boolean>(false);

  // Migration states (T26)
  const [migrating, setMigrating] = useState<boolean>(false);
  const [migrationError, setMigrationError] = useState<string | null>(null);
  const [migrationSuccess, setMigrationSuccess] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [uploadedData, setUploadedData] = useState<any | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Detected local data preview
  const localAppData = loadAppData();
  const localPlayersCount = localAppData?.players?.length || 0;

  const handleMigrateFromLocalStorage = async () => {
    setMigrationError(null);
    setMigrationSuccess(null);
    setMigrating(true);

    try {
      const localData = loadAppData();
      if (!localData || !Array.isArray(localData.players) || localData.players.length === 0) {
        throw new Error('No se encontraron jugadores guardados en el localStorage de este navegador.');
      }

      const res = await fetch('/api/admin/migrate-local-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(localData),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al ejecutar la migración.');
      }

      setMigrationSuccess(
        `Migración exitosa: ${data.migrated.playersCount} jugadores, ${data.migrated.statsCount} estadísticas, ${data.migrated.h2hCount} duelos H2H y ${data.migrated.annualRankingsCount} registros anuales consolidados en PostgreSQL.`
      );
    } catch (err: any) {
      setMigrationError(err.message || 'Error durante la migración.');
    } finally {
      setMigrating(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setMigrationError(null);
    setMigrationSuccess(null);
    setSelectedFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== 'object') {
          throw new Error('El archivo no contiene un JSON válido.');
        }
        setUploadedData(parsed);
      } catch {
        setMigrationError('El archivo seleccionado no es un JSON de backup válido.');
        setUploadedData(null);
      }
    };
    reader.readAsText(file);
  };

  const handleMigrateFromFile = async () => {
    if (!uploadedData) {
      setMigrationError('Seleccioná un archivo JSON primero.');
      return;
    }

    setMigrationError(null);
    setMigrationSuccess(null);
    setMigrating(true);

    try {
      const res = await fetch('/api/admin/migrate-local-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(uploadedData),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al ejecutar la migración.');
      }

      setMigrationSuccess(
        `Migración exitosa desde archivo: ${data.migrated.playersCount} jugadores, ${data.migrated.statsCount} estadísticas, ${data.migrated.h2hCount} duelos H2H y ${data.migrated.annualRankingsCount} registros anuales consolidados en PostgreSQL.`
      );
    } catch (err: any) {
      setMigrationError(err.message || 'Error durante la migración del archivo.');
    } finally {
      setMigrating(false);
    }
  };

  const fetchEntries = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/whitelist', {
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Error al obtener la lista blanca.');
      }
      const data: WhitelistEntryDto[] = await res.json();
      setEntries(data);
    } catch (err: any) {
      setError(err.message || 'Error de conexión.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  const fetchThemes = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingThemes(true);
    setThemesError(null);
    try {
      const res = await fetch('/api/tournaments/themes', {
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || 'Error al obtener temáticas.');
      }
      if (Array.isArray(data?.themes)) {
        setThemes(data.themes);
      }
    } catch (err: any) {
      setThemesError(err.message || 'Error al obtener temáticas.');
    } finally {
      setLoadingThemes(false);
    }
  }, [isAdmin]);

  const handleSelectTheme = (t: ThemeDto) => {
    setSelectedThemeName(t.name);
    setThemeFormName(t.name);
    setThemeFormTeamsText(t.teams.join('\n'));
    setThemesError(null);
    setThemesSuccess(null);
  };

  const handleNewTheme = () => {
    setSelectedThemeName('');
    setThemeFormName('');
    setThemeFormTeamsText('');
    setThemesError(null);
    setThemesSuccess(null);
  };

  const handleSaveTheme = async (e: React.FormEvent) => {
    e.preventDefault();
    setThemesError(null);
    setThemesSuccess(null);

    const trimmedName = themeFormName.trim();
    if (!trimmedName) {
      setThemesError('El nombre de la temática es obligatorio.');
      return;
    }

    const lines = themeFormTeamsText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length < 4) {
      setThemesError('La temática debe contener al menos 4 equipos sin líneas vacías.');
      return;
    }

    setSavingTheme(true);
    try {
      const res = await fetch('/api/tournaments/teams', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          theme: trimmedName,
          teams: lines,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || 'Error al guardar la temática.');
      }

      setThemesSuccess(`Temática "${trimmedName}" guardada exitosamente con ${lines.length} equipos.`);
      await fetchThemes();
      setSelectedThemeName(trimmedName);
    } catch (err: any) {
      setThemesError(err.message || 'Error al guardar la temática.');
    } finally {
      setSavingTheme(false);
    }
  };

  const handleDeleteTheme = async (themeName: string) => {
    const confirmed = window.confirm(
      `¿Seguro que querés eliminar la temática personalizada "${themeName}"? Esta acción no se puede deshacer.`
    );
    if (!confirmed) return;

    setThemesError(null);
    setThemesSuccess(null);
    try {
      const res = await fetch(`/api/tournaments/themes/${encodeURIComponent(themeName)}`, {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || 'Error al eliminar la temática.');
      }

      setThemesSuccess(`Temática "${themeName}" eliminada correctamente.`);
      if (selectedThemeName === themeName) {
        handleNewTheme();
      }
      await fetchThemes();
    } catch (err: any) {
      setThemesError(err.message || 'Error al eliminar la temática.');
    }
  };

  useEffect(() => {
    if (isOpen && isAdmin) {
      fetchEntries();
      fetchThemes();
      setError(null);
      setSuccess(null);
    }
  }, [isOpen, isAdmin, fetchEntries, fetchThemes]);

  if (!isOpen) return null;

  // Strict check: Only ADMIN can view this panel (RF-91)
  if (!isAdmin) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
        <div className="panel-metal max-w-md w-full rounded-md p-6 border border-border shadow-2xl text-center">
          <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-3" />
          <h2 className="font-display text-lg font-bold text-foreground mb-2">Acceso Restringido</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Solo los administradores de la juntada pueden gestionar la lista blanca.
          </p>
          <SecondaryButton onClick={onClose}>Cerrar</SecondaryButton>
        </div>
      </div>
    );
  }

  const handlePlayerSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === '__new__') {
      setIsCreatingNewPlayer(true);
      setSelectedPlayerId('');
    } else {
      setIsCreatingNewPlayer(false);
      setSelectedPlayerId(val);
    }
  };

  const handleAddEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setError('Por favor ingresá un correo válido.');
      return;
    }

    let finalPlayerId: string | null = selectedPlayerId || null;

    // If admin chose to create a new player on the fly
    if (isCreatingNewPlayer) {
      const fName = newFirstName.trim();
      const lName = newLastName.trim();
      if (!fName || !lName) {
        setError('Por favor completá el nombre y apellido del nuevo jugador.');
        return;
      }

      const generatedId = `p-${Date.now()}`;
      dispatch({
        type: 'PLAYER_ADDED',
        player: {
          id: generatedId,
          firstName: fName,
          lastName: lName,
          createdAt: new Date().toISOString().split('T')[0],
        },
      });

      finalPlayerId = generatedId;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/whitelist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          email: trimmedEmail,
          role,
          playerId: finalPlayerId,
        }),
        credentials: 'include',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al agregar el correo.');
      }

      setSuccess(`Correo ${trimmedEmail} agregado a la lista blanca.`);
      setEmail('');
      setRole('PLAYER');
      setSelectedPlayerId('');
      setIsCreatingNewPlayer(false);
      setNewFirstName('');
      setNewLastName('');
      fetchEntries();
    } catch (err: any) {
      setError(err.message || 'Error al registrar el correo.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (entry: WhitelistEntryDto) => {
    const confirmed = window.confirm(
      `¿Seguro que querés dar de baja a ${entry.email} de la lista blanca? Ya no podrá ingresar a la app.`
    );
    if (!confirmed) return;

    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/whitelist/${entry.id}`, {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al eliminar el correo.');
      }

      setSuccess(`Correo ${entry.email} dado de baja de la lista blanca.`);
      setEntries((prev) => prev.filter((item) => item.id !== entry.id));
    } catch (err: any) {
      setError(err.message || 'Error al eliminar el correo.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-5 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="panel-metal w-full max-w-2xl max-h-[92vh] flex flex-col rounded-md border border-border shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/70 px-5 py-3.5 bg-secondary/30">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-6 w-6 text-gold" />
            <div>
              <h2 className="font-display text-lg font-black tracking-wider text-foreground">
                PANEL DE ADMINISTRACIÓN
              </h2>
              <p className="text-xs text-muted-foreground">
                Gestión de Whitelist y Migración de Datos Locales a PostgreSQL.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition"
            title="Cerrar modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs Switcher */}
        <div className="flex border-b border-border/70 bg-secondary/20 px-5 pt-2 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('whitelist')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold uppercase tracking-wider border-b-2 transition ${
              activeTab === 'whitelist'
                ? 'border-gold text-gold'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <ShieldCheck className="h-4 w-4" />
            <span>Whitelist ({entries.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('migration')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold uppercase tracking-wider border-b-2 transition ${
              activeTab === 'migration'
                ? 'border-accent text-accent'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Database className="h-4 w-4" />
            <span>Migración a PostgreSQL</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('themes')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold uppercase tracking-wider border-b-2 transition ${
              activeTab === 'themes'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Shuffle className="h-4 w-4" />
            <span>Temáticas y Equipos ({themes.length})</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {activeTab === 'whitelist' && (
            <>
              {error && (
                <div className="flex items-center gap-2 p-3 bg-destructive/15 border border-destructive/40 text-destructive text-xs rounded-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {success && (
                <div className="flex items-center gap-2 p-3 bg-primary/15 border border-primary/40 text-primary text-xs rounded-sm">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{success}</span>
                </div>
              )}

          {/* Add form */}
          <form onSubmit={handleAddEntry} className="bg-secondary/25 border border-border/80 rounded-sm p-4 space-y-3">
            <h3 className="font-display text-xs font-bold uppercase tracking-wider text-accent flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              <span>Habilitar nuevo correo</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Correo electrónico *
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ejemplo@gmail.com"
                  className={`${inputClassName} w-full text-xs py-2`}
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Rol asignado *
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as 'PLAYER' | 'ADMIN')}
                  className={`${inputClassName} w-full text-xs py-2`}
                >
                  <option value="PLAYER">Jugador (Player)</option>
                  <option value="ADMIN">Administrador (Admin)</option>
                </select>
              </div>
            </div>

            {/* Profile linking */}
            <div className="space-y-2">
              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Vincular a perfil histórico de jugador (RF-90)
              </label>
              <select
                value={isCreatingNewPlayer ? '__new__' : selectedPlayerId}
                onChange={handlePlayerSelectChange}
                className={`${inputClassName} w-full text-xs py-2`}
              >
                <option value="">Sin vincular (o vincular más adelante)</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.firstName} {p.lastName}
                  </option>
                ))}
                <option value="__new__">+ Crear nuevo jugador histórico ahora</option>
              </select>

              {isCreatingNewPlayer && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 animate-in fade-in duration-150">
                  <input
                    type="text"
                    required
                    placeholder="Nombre (ej. Juan)"
                    value={newFirstName}
                    onChange={(e) => setNewFirstName(e.target.value)}
                    className={`${inputClassName} w-full text-xs py-1.5`}
                  />
                  <input
                    type="text"
                    required
                    placeholder="Apellido (ej. Pérez)"
                    value={newLastName}
                    onChange={(e) => setNewLastName(e.target.value)}
                    className={`${inputClassName} w-full text-xs py-1.5`}
                  />
                </div>
              )}
            </div>

            <div className="pt-1 flex justify-end">
              <PrimaryButton type="submit" disabled={submitting} className="py-2 text-xs">
                {submitting ? 'Habilitando...' : 'Habilitar acceso'}
              </PrimaryButton>
            </div>
          </form>

          {/* Whitelist entries list */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xs font-bold uppercase tracking-wider text-foreground">
                Correos habilitados ({entries.length})
              </h3>
              <button
                type="button"
                onClick={fetchEntries}
                disabled={loading}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-accent transition disabled:opacity-50"
                title="Actualizar lista"
              >
                <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
                <span>Actualizar</span>
              </button>
            </div>

            {loading && entries.length === 0 ? (
              <div className="text-center py-8 text-xs text-muted-foreground">
                Cargando lista blanca...
              </div>
            ) : entries.length === 0 ? (
              <div className="text-center py-6 border border-dashed border-border/80 rounded-sm text-xs text-muted-foreground">
                No hay correos en la lista blanca todavía.
              </div>
            ) : (
              <div className="divide-y divide-border/50 border border-border/80 rounded-sm bg-secondary/15 max-h-60 overflow-y-auto">
                {entries.map((entry) => {
                  const linkedPlayer = players.find((p) => p.id === entry.playerId);
                  return (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between gap-3 p-3 hover:bg-secondary/30 transition text-xs"
                    >
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-foreground truncate">{entry.email}</span>
                          <span
                            className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider ${
                              entry.role === 'ADMIN'
                                ? 'bg-gold/20 text-gold border border-gold/40'
                                : 'bg-primary/10 text-primary border border-primary/30'
                            }`}
                          >
                            {entry.role === 'ADMIN' ? 'Admin' : 'Jugador'}
                          </span>
                        </div>
                        <span className="text-[11px] text-muted-foreground truncate">
                          {linkedPlayer ? (
                            <span className="text-accent font-medium">
                              Vinculado a: {linkedPlayer.firstName} {linkedPlayer.lastName}
                            </span>
                          ) : entry.playerId ? (
                            <span>ID de Jugador: {entry.playerId}</span>
                          ) : (
                            <span className="italic text-muted-foreground/70">Sin perfil vinculado</span>
                          )}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDelete(entry)}
                        className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition shrink-0"
                        title="Dar de baja de la lista blanca"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
            </>
          )}

          {activeTab === 'migration' && (
            <div className="space-y-4">
              {/* Informative Header Box */}
              <div className="rounded-md border border-accent/40 bg-accent/10 p-3.5 text-xs text-foreground/90 space-y-1.5">
                <div className="flex items-center gap-2 font-display font-bold uppercase tracking-wider text-accent">
                  <Database className="h-4 w-4" />
                  <span>Migración Idempotente a PostgreSQL (schemaVersion: 2)</span>
                </div>
                <p className="leading-relaxed text-muted-foreground">
                  Esta herramienta importa los jugadores, estadísticas históricas (PJ, PG, PE, PP, GF, GC, tarjetas y podios), duelos Head-to-Head y el Ranking Anual acumulados desde la versión local hacia la base de datos PostgreSQL.
                </p>
                <p className="text-[11px] text-accent/80 font-mono">
                  * Operación idempotente: podés ejecutarla cuantas veces quieras; actualiza por claves únicas sin duplicar ningún registro.
                </p>
              </div>

              {/* Status Feedback */}
              {migrationError && (
                <div className="flex items-center gap-2 p-3 bg-destructive/15 border border-destructive/40 text-destructive text-xs rounded-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{migrationError}</span>
                </div>
              )}

              {migrationSuccess && (
                <div className="flex items-center gap-2 p-3 bg-primary/15 border border-primary/40 text-primary text-xs rounded-sm">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{migrationSuccess}</span>
                </div>
              )}

              {/* Option A: Migrate from current browser's localStorage */}
              <div className="rounded-sm border border-border/80 bg-secondary/25 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <HardDrive className="h-4 w-4 text-primary" />
                    <h3 className="font-display text-xs font-bold uppercase tracking-wider text-foreground">
                      Opción A: Migrar desde este Navegador
                    </h3>
                  </div>
                  <span className="rounded bg-primary/15 border border-primary/30 px-2 py-0.5 text-[10px] font-mono font-bold text-primary">
                    {localPlayersCount} jugadores en localStorage
                  </span>
                </div>

                <p className="text-xs text-muted-foreground">
                  Lee directamente el estado guardado en el almacenamiento local (<code className="text-accent text-[11px]">second-is-last:data</code>) de este dispositivo y lo sincroniza con la nube.
                </p>

                <div className="flex justify-end pt-1">
                  <PrimaryButton
                    type="button"
                    disabled={migrating || localPlayersCount === 0}
                    onClick={handleMigrateFromLocalStorage}
                    className="py-2 text-xs flex items-center gap-1.5"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${migrating ? 'animate-spin' : ''}`} />
                    <span>{migrating ? 'Migrando datos...' : 'Migrar localStorage actual'}</span>
                  </PrimaryButton>
                </div>
              </div>

              {/* Option B: Upload and Migrate JSON backup file */}
              <div className="rounded-sm border border-border/80 bg-secondary/25 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <FileUp className="h-4 w-4 text-gold" />
                  <h3 className="font-display text-xs font-bold uppercase tracking-wider text-foreground">
                    Opción B: Subir Archivo JSON de Backup
                  </h3>
                </div>

                <p className="text-xs text-muted-foreground">
                  Subí un archivo JSON exportado previamente desde la versión 1.0 o 2.0 local para poblar la base de datos en la nube.
                </p>

                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".json,application/json"
                  onChange={handleFileChange}
                  className="hidden"
                />

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
                  <button
                    type="button"
                    disabled={migrating}
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center justify-center gap-1.5 rounded-sm border border-border bg-secondary/60 hover:bg-secondary text-foreground px-3 py-2 text-xs font-semibold uppercase tracking-wider transition"
                  >
                    <UploadCloud className="h-3.5 w-3.5 text-accent" />
                    <span>{selectedFileName ? 'Cambiar archivo' : 'Elegir archivo .json'}</span>
                  </button>

                  {selectedFileName && (
                    <div className="flex items-center gap-2 flex-1 min-w-0 px-2 py-1 bg-secondary/40 rounded border border-border/60 text-xs">
                      <FileCheck2 className="h-4 w-4 text-primary shrink-0" />
                      <span className="truncate text-foreground font-mono text-[11px]">{selectedFileName}</span>
                    </div>
                  )}

                  <PrimaryButton
                    type="button"
                    disabled={migrating || !uploadedData}
                    onClick={handleMigrateFromFile}
                    className="py-2 text-xs flex items-center justify-center gap-1.5 shrink-0"
                  >
                    <Database className={`h-3.5 w-3.5 ${migrating ? 'animate-spin' : ''}`} />
                    <span>{migrating ? 'Importando...' : 'Importar a PostgreSQL'}</span>
                  </PrimaryButton>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'themes' && (
            <div className="space-y-5">
              {themesError && (
                <div className="flex items-center gap-2 p-3 bg-destructive/15 border border-destructive/40 text-destructive text-xs rounded-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{themesError}</span>
                </div>
              )}

              {themesSuccess && (
                <div className="flex items-center gap-2 p-3 bg-primary/15 border border-primary/40 text-primary text-xs rounded-sm">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{themesSuccess}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Left: Themes list */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                      <Layers className="h-4 w-4 text-primary" />
                      <span>Temáticas ({themes.length})</span>
                    </h3>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={fetchThemes}
                        disabled={loadingThemes}
                        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition"
                        title="Actualizar lista"
                      >
                        <RefreshCw className={`h-3 w-3 ${loadingThemes ? 'animate-spin' : ''}`} />
                        <span className="hidden sm:inline">Refrescar</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleNewTheme}
                        className="flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"
                        title="Crear nueva temática desde cero"
                      >
                        <Plus className="h-3 w-3" />
                        <span>+ Nueva</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                    {themes.map((t) => {
                      const isSelected = selectedThemeName === t.name;
                      return (
                        <div
                          key={t.name}
                          onClick={() => handleSelectTheme(t)}
                          className={`flex items-center justify-between p-3 rounded-sm border cursor-pointer transition ${
                            isSelected
                              ? 'border-primary bg-primary/15 shadow-sm'
                              : 'border-border/70 bg-secondary/20 hover:bg-secondary/40'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-xs text-foreground truncate">
                                {t.name}
                              </span>
                              <span
                                className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${
                                  t.isCustom
                                    ? 'bg-primary/20 text-primary border-primary/40 font-bold'
                                    : 'bg-secondary text-muted-foreground border-border/80'
                                }`}
                              >
                                {t.isCustom ? 'Personalizada' : 'Oficial'}
                              </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                              {t.teams.length} equipos: {t.teams.slice(0, 3).join(', ')}
                              {t.teams.length > 3 ? '...' : ''}
                            </p>
                          </div>

                          <div className="flex items-center gap-1 ml-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectTheme(t);
                              }}
                              className="p-1 rounded text-muted-foreground hover:text-primary transition"
                              title="Editar equipos de esta temática"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                            {t.isCustom && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteTheme(t.name);
                                }}
                                className="p-1 rounded text-muted-foreground hover:text-destructive transition"
                                title="Eliminar temática personalizada"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right: Create / Edit Form */}
                <form
                  onSubmit={handleSaveTheme}
                  className="bg-secondary/25 border border-border/80 rounded-sm p-4 space-y-3 flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-border/60 pb-2">
                      <h3 className="font-display text-xs font-bold uppercase tracking-wider text-accent flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>
                          {selectedThemeName
                            ? `Editar: ${selectedThemeName}`
                            : 'Crear Nueva Temática'}
                        </span>
                      </h3>
                      {selectedThemeName && (
                        <button
                          type="button"
                          onClick={handleNewTheme}
                          className="text-[10px] text-muted-foreground hover:text-foreground underline"
                        >
                          Limpiar / Nueva
                        </button>
                      )}
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                        Nombre de la temática *
                      </label>
                      <input
                        type="text"
                        required
                        value={themeFormName}
                        onChange={(e) => setThemeFormName(e.target.value)}
                        placeholder="Ej. Selecciones Clásicas, Apertura 2006..."
                        className={`${inputClassName} w-full text-xs py-2`}
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                        Equipos que pertenecen a la temática (uno por línea) *
                      </label>
                      <textarea
                        rows={9}
                        required
                        value={themeFormTeamsText}
                        onChange={(e) => setThemeFormTeamsText(e.target.value)}
                        placeholder="Boca Juniors&#10;River Plate&#10;Independiente&#10;Racing Club&#10;San Lorenzo..."
                        className="w-full rounded border border-border bg-secondary/50 p-2.5 font-mono text-xs text-foreground focus:border-primary focus:outline-none"
                      />
                      <span className="text-[10px] text-muted-foreground">
                        Mínimo 4 equipos. Cada línea representa un equipo seleccionable.
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-border/60 flex items-center justify-end gap-2">
                    <PrimaryButton
                      type="submit"
                      disabled={savingTheme}
                      className="py-2 text-xs flex items-center justify-center gap-1.5"
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                      <span>{savingTheme ? 'Guardando en DB...' : 'Guardar en PostgreSQL'}</span>
                    </PrimaryButton>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-border/70 px-5 py-3 bg-secondary/30">
          <SecondaryButton onClick={onClose} className="py-2 text-xs">
            Cerrar
          </SecondaryButton>
        </div>
      </div>
    </div>
  );
}
