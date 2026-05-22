import {
  Type,
  ImageIcon,
  Square,
  Circle,
  Triangle,
  Star,
  Minus,
  ArrowRight,
  ArrowLeft,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Save,
  Download,
  Package,
  Loader2,
} from 'lucide-react';
import { useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { saveAs } from 'file-saver';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useEditorStore, generateElementId } from '@/stores/editor-store';
import type { EditorElement } from '@/stores/editor-store';
import { useCarouselSave } from '@/hooks/use-carousel-save';
import { exportSlideToPng } from '@/lib/export/export-png';
import { downloadSlidesAsZip } from '@/lib/export/download-zip';

export function EditorToolbar() {
  const {
    addElement,
    zoom,
    setZoom,
    saveStatus,
  } = useEditorStore();

  const { save } = useCarouselSave();
  const navigate = useNavigate();

  const [exportingPng, setExportingPng] = useState(false);
  const [exportingZip, setExportingZip] = useState(false);
  const [navigatingBack, setNavigatingBack] = useState(false);

  async function handleBack() {
    if (saveStatus === 'saved') {
      navigate('/');
      return;
    }
    setNavigatingBack(true);
    try {
      await save();
      // save() faz toast.error e seta status='unsaved' em caso de falha
      if (useEditorStore.getState().saveStatus === 'unsaved') return;
      navigate('/');
    } finally {
      setNavigatingBack(false);
    }
  }

  async function handleExportCurrentSlide() {
    const { slides, activeSlideIndex } = useEditorStore.getState();
    const slide = slides[activeSlideIndex];
    if (!slide) return;
    setExportingPng(true);
    try {
      const blob = await exportSlideToPng(slide);
      saveAs(blob, `slide-${String(activeSlideIndex + 1).padStart(2, '0')}.png`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao exportar slide');
    } finally {
      setExportingPng(false);
    }
  }

  async function handleExportAllZip() {
    const { slides } = useEditorStore.getState();
    if (slides.length === 0) return;
    setExportingZip(true);
    try {
      await downloadSlidesAsZip(slides, 'carrossel');
      toast.success('Download iniciado');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao exportar ZIP');
    } finally {
      setExportingZip(false);
    }
  }

  const imageObjectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (imageObjectUrlRef.current) {
        URL.revokeObjectURL(imageObjectUrlRef.current);
      }
    };
  }, []);

  function addText() {
    const element: EditorElement = {
      id: generateElementId(),
      type: 'Text',
      name: 'Texto',
      visible: true,
      locked: false,
      attrs: {
        x: 100,
        y: 300,
        text: 'Novo texto',
        fontSize: 36,
        fontFamily: 'Inter',
        fill: '#1f2937',
        width: 880,
        align: 'center',
        draggable: true,
      },
    };
    addElement(element);
  }

  function addShape(
    type: EditorElement['type'],
    name: string,
    attrs: Record<string, unknown>
  ) {
    const element: EditorElement = {
      id: generateElementId(),
      type,
      name,
      visible: true,
      locked: false,
      attrs: {
        x: 340,
        y: 475,
        fill: '#6366f1',
        draggable: true,
        ...attrs,
      },
    };
    addElement(element);
  }

  const shapes = [
    { icon: Square, label: 'Retangulo', type: 'Rect' as const, attrs: { width: 400, height: 400 } },
    { icon: Circle, label: 'Circulo', type: 'Circle' as const, attrs: { radius: 150 } },
    { icon: Triangle, label: 'Triangulo', type: 'RegularPolygon' as const, attrs: { sides: 3, radius: 150 } },
    { icon: Star, label: 'Estrela', type: 'Star' as const, attrs: { numPoints: 5, innerRadius: 60, outerRadius: 150 } },
    { icon: Minus, label: 'Linha', type: 'Line' as const, attrs: { points: [0, 0, 400, 0], stroke: '#6366f1', strokeWidth: 4, fill: undefined } },
    { icon: ArrowRight, label: 'Seta', type: 'Arrow' as const, attrs: { points: [0, 0, 400, 0], stroke: '#6366f1', strokeWidth: 4, fill: '#6366f1' } },
  ];

  const canUndo = useEditorStore((s) => s.historyIndex >= 0);
  const canRedo = useEditorStore((s) => s.historyIndex < s.history.length - 1);

  return (
    <div className="flex items-center gap-1 border-b glass-surface px-3 py-1.5">
      {/* Voltar ao Dashboard */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => void handleBack()}
        disabled={navigatingBack}
        title="Voltar ao Dashboard (salva antes de sair)"
      >
        {navigatingBack ? (
          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
        ) : (
          <ArrowLeft className="mr-1 h-4 w-4" />
        )}
        <span className="text-xs">Voltar</span>
      </Button>

      <Separator orientation="vertical" className="mx-1 h-6" />

      {/* Add elements */}
      <Button variant="ghost" size="sm" onClick={addText} title="Adicionar texto">
        <Type className="mr-1 h-4 w-4" />
        <span className="text-xs">Texto</span>
      </Button>

      <Button variant="ghost" size="sm" title="Adicionar imagem" onClick={() => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (!file) return;
          if (imageObjectUrlRef.current) {
            URL.revokeObjectURL(imageObjectUrlRef.current);
          }
          const url = URL.createObjectURL(file);
          imageObjectUrlRef.current = url;
          const img = new window.Image();
          img.src = url;
          img.onload = () => {
            const element: EditorElement = {
              id: generateElementId(),
              type: 'Image',
              name: file.name,
              visible: true,
              locked: false,
              attrs: {
                x: 140,
                y: 200,
                width: 800,
                height: (800 / img.width) * img.height,
                src: url,
                draggable: true,
              },
            };
            addElement(element);
          };
        };
        input.click();
      }}>
        <ImageIcon className="mr-1 h-4 w-4" />
        <span className="text-xs">Imagem</span>
      </Button>

      <Separator orientation="vertical" className="mx-1 h-6" />

      {/* Shapes */}
      {shapes.map((shape) => (
        <Button
          key={shape.label}
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title={shape.label}
          onClick={() => addShape(shape.type, shape.label, shape.attrs)}
        >
          <shape.icon className="h-3.5 w-3.5" />
        </Button>
      ))}

      <Separator orientation="vertical" className="mx-1 h-6" />

      {/* Undo/Redo */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => useEditorStore.getState().undo()}
        disabled={!canUndo}
        title="Desfazer (Ctrl+Z)"
      >
        <Undo2 className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => useEditorStore.getState().redo()}
        disabled={!canRedo}
        title="Refazer (Ctrl+Shift+Z)"
      >
        <Redo2 className="h-3.5 w-3.5" />
      </Button>

      <Separator orientation="vertical" className="mx-1 h-6" />

      {/* Zoom */}
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom(zoom - 0.1)}>
        <ZoomOut className="h-3.5 w-3.5" />
      </Button>
      <span className="w-12 text-center text-xs text-[#94A3B8]">
        {Math.round(zoom * 100)}%
      </span>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom(zoom + 0.1)}>
        <ZoomIn className="h-3.5 w-3.5" />
      </Button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Export */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        title="Baixar slide atual (PNG)"
        onClick={() => void handleExportCurrentSlide()}
        disabled={exportingPng}
      >
        {exportingPng ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        title="Baixar todos (ZIP)"
        onClick={() => void handleExportAllZip()}
        disabled={exportingZip}
      >
        {exportingZip ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Package className="h-3.5 w-3.5" />}
      </Button>

      <Separator orientation="vertical" className="mx-1 h-6" />

      {/* Save status */}
      <span className="text-xs text-[#94A3B8]">
        {saveStatus === 'saved' && 'Salvo'}
        {saveStatus === 'saving' && 'Salvando...'}
        {saveStatus === 'unsaved' && 'Nao salvo'}
      </span>
      <Button variant="ghost" size="icon" className="h-7 w-7" title="Salvar" onClick={save}>
        <Save className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
