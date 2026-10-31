import type { ComponentType } from "react";
import {
  AudioLines,
  Bot,
  Boxes,
  BrainCircuit,
  Clapperboard,
  Code2,
  Cpu,
  Earth,
  FlaskConical,
  Image,
  Languages,
  ScanText,
  Shapes,
  ShieldCheck,
  Table2,
  type LucideProps,
} from "lucide-react";
import type { CategoryId } from "../types";

const icons: Record<CategoryId, ComponentType<LucideProps>> = {
  language: Languages,
  reasoning: BrainCircuit,
  code: Code2,
  vision: Image,
  multimodal: Shapes,
  audio: AudioLines,
  video: Clapperboard,
  science: FlaskConical,
  earth: Earth,
  tabular: Table2,
  agents: Bot,
  safety: ShieldCheck,
  embeddings: Boxes,
  robotics: Cpu,
  documents: ScanText,
};

export function CategoryIcon({
  category,
  size = 18,
  strokeWidth = 1.8,
}: {
  category: CategoryId;
  size?: number;
  strokeWidth?: number;
}) {
  const Icon = icons[category];
  return <Icon size={size} strokeWidth={strokeWidth} aria-hidden="true" />;
}

export function categoryIconComponent(category: CategoryId) {
  return icons[category];
}
