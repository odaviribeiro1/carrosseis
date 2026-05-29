import { useState, useRef } from 'react';
import { Palette, Upload, X, ArrowLeft, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { getSupabaseClient } from '@/lib/supabase';
import type { VisualSettings } from '@/types/carousel';
import { toast } from 'sonner';

interface VisualSettingsStepProps {
  initial: VisualSettings;
  onBack: () => void;
  onGenerate: (settings: VisualSettings) => void;
  isGenerating: boolean;
}

const presetPalettes = [
  { name: 'Profissional', colors: ['#1E3A5F', '#3B82F6', '#94A3B8', '#F8FAFC', '#0F1223'] },
  { name: 'Vibrante', colors: ['#FF6B6B', '#FFA94D', '#FFD43B', '#69DB7C', '#9775FA'] },
  { name: 'Escuro', colors: ['#0F1223', '#1E293B', '#334155', '#475569', '#94A3B8'] },
  { name: 'Natureza', colors: ['#2D6A4F', '#52B788', '#95D5B2', '#D8F3DC', '#1B4332'] },
  { name: 'Pastel', colors: ['#F8EDEB', '#FCD5CE', '#F9DCC4', '#E8E8E4', '#D8E2DC'] },
];

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

  function updateField<K extends keyof VisualSettings>(key: K, value: VisualSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  function selectPalette(colors: string[]) {
    updateField('colorPalette', colors);
  }

  function updatePaletteColor(index: number, color: string) {
    const newColors = [...settings.colorPalette];
    newColors[index] = color;
    updateField('colorPalette', newColors);
  }

  async function handleUpload(file: File) {
    if (!file) return;
    setUploading(true);
    try {
      const client = getSupabaseClient();
      if (!client) throw new Error('Supabase nao configurado');

      const { data: { user } } = await client.auth.getUser();
      if (!user) throw new Error('Nao autenticado');

      const ext = file.name.split('.').pop();
      const path = `reference-images/${user.id}/${Date.now()}.${ext}`;

      const { error: uploadError } = await client.storage
        .from('images')
        .upload(path, file, { upsert: false });

      if (uploadError) throw uploadError;

      const { data: urlData } = await client.storage
        .from('images')
        .getPublicUrl(path);

      updateField('referenceImageUrl', urlData.publicUrl);
      toast.success('Imagem de referencia enviada');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao enviar imagem');
    } finally {
      setUploading(false);
    }
  }

  function removeReferenceImage() {
    updateField('referenceImageUrl', null);
    if (fileInputRef.current) fileInputRef.current.value = '';
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

        {/* Color Palette */}
        <div className="space-y-2">
          <Label>Paleta de Cores</Label>
          <div className="flex flex-wrap gap-2">
            {presetPalettes.map((p) => (
              <button
                key={p.name}
                type="button"
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-all ${
                  JSON.stringify(settings.colorPalette) === JSON.stringify(p.colors)
                    ? 'border-[#3B82F6] bg-[rgba(59,130,246,0.1)] text-[#3B82F6]'
                    : 'border-[rgba(59,130,246,0.15)] text-[#94A3B8] hover:border-[rgba(59,130,246,0.3)]'
                }`}
                onClick={() => selectPalette(p.colors)}
              >
                <div className="flex -space-x-1">
                  {p.colors.map((c, i) => (
                    <div
                      key={i}
                      className="h-4 w-4 rounded-full border border-[rgba(0,0,0,0.2)]"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <span>{p.name}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-[#94A3B8]" />
            <span className="text-xs text-[#94A3B8]">Personalizar cores:</span>
            {settings.colorPalette.map((color, i) => (
              <div key={i} className="relative">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => updatePaletteColor(i, e.target.value)}
                  className="h-7 w-7 cursor-pointer rounded-full border border-[rgba(59,130,246,0.2)] bg-transparent p-0"
                />
              </div>
            ))}
          </div>
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

        {/* Reference Image */}
        <div className="space-y-2">
          <Label>Imagem de Referencia (opcional)</Label>
          {settings.referenceImageUrl ? (
            <div className="relative inline-block">
              <img
                src={settings.referenceImageUrl}
                alt="Referencia"
                className="h-24 w-24 rounded-lg border border-[rgba(59,130,246,0.2)] object-cover"
              />
              <button
                type="button"
                onClick={removeReferenceImage}
                className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-[rgba(59,130,246,0.2)] p-6 transition-colors hover:border-[rgba(59,130,246,0.4)]"
            >
              {uploading ? (
                <Loader2 className="h-6 w-6 animate-spin text-[#94A3B8]" />
              ) : (
                <div className="flex flex-col items-center gap-1 text-xs text-[#94A3B8]">
                  <Upload className="h-5 w-5" />
                  <span>Clique para enviar imagem de referencia</span>
                </div>
              )}
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleUpload(file);
            }}
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
              <><Sparkles className="mr-2 h-4 w-4" /> Gerar Carrossel</>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
