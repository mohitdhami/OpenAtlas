export type Kind = "dataset" | "model";

export type CategoryId =
  | "language"
  | "reasoning"
  | "code"
  | "vision"
  | "multimodal"
  | "audio"
  | "video"
  | "science"
  | "earth"
  | "tabular"
  | "agents"
  | "safety"
  | "embeddings"
  | "robotics"
  | "documents";

export type LicenseClass =
  | "permissive"
  | "conditional"
  | "noncommercial"
  | "research";

export type Access = "open" | "gated" | "application";

export interface Resource {
  id: string;
  name: string;
  kind: Kind;
  category: CategoryId;
  maker: string;
  year: number;
  summary: string;
  bestFor: string[];
  tags: string[];
  license: string;
  licenseClass: LicenseClass;
  access: Access;
  accessNote?: string;
  scale: string;
  url: string;
  featured?: boolean;
  licenseNote?: string;
}

export interface Category {
  id: CategoryId;
  label: string;
  short: string;
  description: string;
  color: string;
}
