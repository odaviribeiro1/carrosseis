import { useState, useRef, useEffect } from 'react';
import { Upload, X, ArrowLeft, ArrowRight, Loader2, Save, Bookmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { VisualSettings } from '@/types/carousel';
import { getSupabaseClient } from '@/lib/supabase';
import {
  listVisualPresets,
  saveVisualPreset,
  deleteVisualPreset,
  type VisualPreset,
} from '@/lib/visualPresets';
import { toast } from 'sonner';

interface VisualSettingsStepProps {
  initial: VisualSettings;
  onBack: () => void;
  onGenerate: (settings: VisualSettings) => void;
  isGenerating: boolean;
}

const styleOptions = [
  { value: 'realista', label: 'Realista' },
  { value: 'ilustracao', label: 'Ilustracao' },
  { value: '3d', label: '3D / Render' },
  { value: 'cinematografico', label: 'Cinematografico' },
  { value: 'arte_digital', label: 'Arte Digital' },
  { value: 'vintage', label: 'Vintage / Retro' },
  { value: 'minimalista', label: 'Minimalista' },
];

const aspectOptions = [
  { value: '1:1', label: 'Quadrado (1:1)' },
  { value: '4:5', label: 'Retrato (4:5)' },
  { value: '16:9', label: 'Paisagem (16:9)' },
];

export function VisualSettingsStep({ initial, onBack, onGenerate, isGenerating }: VisualSettingsStepProps) {
  const [settings, setSettings] = useState<VisualSettings>(initial);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Presets de aspectos visuais (compartilhados na instancia).
  const [presets, setPresets] = useState<VisualPreset[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [savingPreset, setSavingPreset] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const client = getSupabaseClient();
        if (client) {
          const { data: { user } } = await client.auth.getUser();
          if (active) setMyUserId(user?.id ?? null);
        }
        const list = await listVisualPresets();
        if (active) setPresets(list);
      } catch (err) {
        console.error('Erro ao carregar presets:', err);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  function updateField<K extends keyof VisualSettings>(key: K, value: VisualSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  function applyPreset(preset: VisualPreset) {
    setSettings(preset.settings);
    toast.success(`Preset "${preset.name}" aplicado`);
  }

  async function handleSavePreset() {
    const name = presetName.trim();
    if (!name) {
      toast.error('Da um nome ao preset.');
      return;
    }
    setSavingPreset(true);
    try {
      const created = await saveVisualPreset(name, settings);
      setPresets((prev) => [created, ...prev]);
      setSaveOpen(false);
      setPresetName('');
      toast.success('Preferencias salvas como preset');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar preset');
    } finally {
      setSavingPreset(false);
    }
  }

  async function handleDeletePreset(id: string) {
    try {
      await deleteVisualPreset(id);
      setPresets((prev) => prev.filter((p) => p.id !== id));
      toast.success('Preset removido');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao remover preset');
    }
  }

  const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB
  const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

  function handleUploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    setUploading(true);
    let pending = list.length;
    const dataUrls: string[] = [];
    const finish = () => {
      pending -= 1;
      if (pending === 0) {
        if (dataUrls.length > 0) {
          setSettings((prev) => ({
            ...prev,
            referenceImages: [...prev.referenceImages, ...dataUrls],
          }));
        }
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    for (const file of list) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        toast.error(`"${file.name}": formato nao suportado (use PNG, JPG ou WEBP).`);
        finish();
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        toast.error(`"${file.name}": imagem muito grande (max 10MB).`);
        finish();
        continue;
      }
      const reader = new FileReader();
      reader.onload = () => {
        dataUrls.push(reader.result as string);
        finish();
      };
      reader.onerror = () => {
        toast.error(`Erro ao ler "${file.name}".`);
        finish();
      };
      reader.readAsDataURL(file);
    }
  }

  function removeReferenceImage(index: number) {
    setSettings((prev) => ({
      ...prev,
      referenceImages: prev.referenceImages.filter((_, i) => i !== index),
    }));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Aspectos Visuais</CardTitle>
        <CardDescription>
          Defina o estilo visual das imagens que serao geradas pela IA.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Presets de aspectos visuais (compartilhados) */}
        <div className="space-y-2 rounded-lg border border-[rgba(59,130,246,0.12)] bg-[rgba(59,130,246,0.03)] p-3">
          <div className="flex items-center justify-between gap-2">
            <Label>Presets salvos</Label>
            <Button type="button" variant="outline" size="sm" onClick={() => setSaveOpen(true)}>
              <Save className="mr-2 h-4 w-4" /> Salvar preferencias
            </Button>
          </div>
          {presets.length === 0 ? (
            <p className="text-xs text-[#94A3B8]">
              Nenhum preset salvo. Salve estes aspectos visuais para reutilizar em outros carrosseis.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {presets.map((p) => (
                <div key={p.id} className="relative">
                  <button
                    type="button"
                    onClick={() => applyPreset(p)}
                    className="flex items-center gap-1.5 rounded-lg border border-[rgba(59,130,246,0.15)] px-2.5 py-1.5 text-xs text-[#94A3B8] transition-all hover:border-[rgba(59,130,246,0.3)] hover:text-[#3B82F6]"
                  >
                    <Bookmark className="h-3.5 w-3.5" />
                    <span>{p.name}</span>
                  </button>
                  {myUserId === p.created_by && (
                    <button
                      type="button"
                      onClick={() => void handleDeletePreset(p.id)}
                      title="Excluir preset"
                      className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Image Style */}
        <div className="space-y-2">
          <Label>Estilo das Imagens</Label>
          <Select
            value={settings.imageStyle}
            onValueChange={(v) => updateField('imageStyle', v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {styleOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>



        {/* Aspect Ratio */}
        <div className="space-y-2">
          <Label>Proporcao das Imagens</Label>
          <div className="flex gap-2">
            {aspectOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`flex-1 rounded-lg border px-3 py-2 text-center text-xs transition-all ${
                  settings.aspectRatio === opt.value
                    ? 'border-[#3B82F6] bg-[rgba(59,130,246,0.1)] text-[#3B82F6]'
                    : 'border-[rgba(59,130,246,0.15)] text-[#94A3B8] hover:border-[rgba(59,130,246,0.3)]'
                }`}
                onClick={() => updateField('aspectRatio', opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Reference Images (multiplas) */}
        <div className="space-y-2">
          <Label>Imagens de Referencia (opcional)</Label>
          <div className="flex flex-wrap gap-2">
            {settings.referenceImages.map((img, i) => (
              <div key={i} className="relative">
                <img
                  src={img}
                  alt={`Referencia ${i + 1}`}
                  className="h-24 w-24 rounded-lg border border-[rgba(59,130,246,0.2)] object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeReferenceImage(i)}
                  className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-[rgba(59,130,246,0.2)] text-center text-[10px] text-[#94A3B8] transition-colors hover:border-[rgba(59,130,246,0.4)]"
            >
              {uploading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <Upload className="h-5 w-5" />
                  <span>Adicionar</span>
                </>
              )}
            </div>
          </div>
          {settings.referenceImages.length > 0 && (
            <p className="text-[10px] text-[#94A3B8]">
              {settings.referenceImages.length} imagem(ns) de referencia. Usadas como inspiracao na geracao.
            </p>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            className="hidden"
            onChange={(e) => handleUploadFiles(e.target.files)}
          />
        </div>

        {/* Image Prompt */}
        <div className="space-y-2">
          <Label>Prompt de Imagem (opcional)</Label>
          <textarea
            className="flex min-h-[80px] w-full rounded-md border border-[rgba(59,130,246,0.2)] bg-[rgba(15,18,35,0.5)] px-3 py-2 text-sm placeholder:text-[#64748B]"
            placeholder="Instrucoes adicionais para geracao das imagens (ex: 'iluminacao suave, fundo desfocado')"
            value={settings.imagePrompt}
            onChange={(e) => updateField('imagePrompt', e.target.value)}
          />
        </div>

        {/* Resolution */}
        <div className="space-y-2">
          <Label>Resolucao</Label>
          <Select
            value={settings.resolution}
            onValueChange={(v) => updateField('resolution', v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="standard">Padrao</SelectItem>
              <SelectItem value="high">Alta</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onBack} className="flex-1">
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
          <Button
            type="button"
            className="flex-1"
            disabled={isGenerating}
            onClick={() => onGenerate(settings)}
          >
            {isGenerating ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Gerando...</>
            ) : (
              <>Proximo <ArrowRight className="ml-2 h-4 w-4" /></>
            )}
          </Button>
        </div>

        {/* Dialog: salvar preferencias como preset */}
        <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Salvar preferencias</DialogTitle>
              <DialogDescription>
                Guarda estes aspectos visuais (estilo, paleta, proporcao, imagens de
                referencia, prompt e resolucao) como um preset reutilizavel. Fica
                disponivel para todos os membros.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="preset-name">Nome do preset</Label>
              <Input
                id="preset-name"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleSavePreset();
                  }
                }}
                placeholder="Ex: Print do Twitter - esportes"
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSaveOpen(false)}
                disabled={savingPreset}
              >
                Cancelar
              </Button>
              <Button type="button" onClick={() => void handleSavePreset()} disabled={savingPreset}>
                {savingPreset ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...</>
                ) : (
                  <><Save className="mr-2 h-4 w-4" /> Salvar</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
