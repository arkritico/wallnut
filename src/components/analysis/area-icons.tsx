import {
  Ruler, Columns3, Flame, Wind, Droplets, Fuel, Plug, Wifi,
  Zap, Volume2, Accessibility, Lightbulb, ArrowUpDown,
  FileText, Recycle, MapPin, PenTool, Building,
} from "lucide-react";

/** Area icons for specialty tiles and hierarchy headers */
export const AREA_ICONS: Record<string, React.ReactNode> = {
  architecture: <Ruler className="w-4 h-4 text-teal-600" />,
  structural: <Columns3 className="w-4 h-4 text-stone-600" />,
  fire_safety: <Flame className="w-4 h-4 text-orange-500" />,
  hvac: <Wind className="w-4 h-4 text-cyan-600" />,
  water_drainage: <Droplets className="w-4 h-4 text-sky-500" />,
  gas: <Fuel className="w-4 h-4 text-red-500" />,
  electrical: <Plug className="w-4 h-4 text-amber-600" />,
  telecommunications: <Wifi className="w-4 h-4 text-cyan-500" />,
  thermal: <Zap className="w-4 h-4 text-accent" />,
  acoustic: <Volume2 className="w-4 h-4 text-indigo-500" />,
  accessibility: <Accessibility className="w-4 h-4 text-purple-500" />,
  energy: <Lightbulb className="w-4 h-4 text-yellow-500" />,
  elevators: <ArrowUpDown className="w-4 h-4 text-violet-500" />,
  licensing: <FileText className="w-4 h-4 text-emerald-600" />,
  waste: <Recycle className="w-4 h-4 text-lime-600" />,
  municipal: <MapPin className="w-4 h-4 text-rose-500" />,
  drawings: <PenTool className="w-4 h-4 text-pink-500" />,
  general: <Building className="w-4 h-4 text-gray-500" />,
};
