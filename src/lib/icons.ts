import {
  Baby, BookMarked, BookOpen, Briefcase, Calculator, Church, Compass, FlaskConical, Globe2,
  HeartPulse, Languages, Laptop, Library, Palette, type LucideIcon,
} from 'lucide-react';

const icons: Record<string, LucideIcon> = {
  BookOpen, Library, FlaskConical, Calculator, Languages, Globe2, Briefcase, Laptop, BookMarked,
  Church, Palette, HeartPulse, Compass, Baby,
};

export function categoryIcon(name?: string | null): LucideIcon {
  return (name && icons[name]) || BookOpen;
}
