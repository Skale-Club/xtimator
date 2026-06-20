export interface Industry {
  id: string
  label: string
  icon: string
  projectTypes: string[]
}

export const INDUSTRIES: Industry[] = [
  {
    id: 'house_cleaning',
    label: 'House Cleaning',
    icon: 'SprayCan',
    projectTypes: [
      'Deep Cleaning',
      'Regular Maintenance',
      'Move-In/Out',
      'Post-Construction',
      'Recurring Service',
    ],
  },
  {
    id: 'upholstery_carpet_cleaning',
    label: 'Upholstery & Carpet Cleaning',
    icon: 'Sofa',
    projectTypes: [
      'Carpet Cleaning',
      'Upholstery Cleaning',
      'Area Rug Cleaning',
      'Stain Removal',
      'Pet Odor Treatment',
    ],
  },
  {
    id: 'painting',
    label: 'Painting',
    icon: 'Paintbrush',
    projectTypes: [
      'Interior Painting',
      'Exterior Painting',
      'Cabinet Refinishing',
      'Staining',
      'Wallpaper',
    ],
  },
  {
    id: 'landscaping',
    label: 'Landscaping',
    icon: 'TreePine',
    projectTypes: [
      'Lawn Care',
      'Garden Design',
      'Hardscaping',
      'Tree Service',
      'Irrigation',
    ],
  },
  {
    id: 'electrical',
    label: 'Electrical',
    icon: 'Zap',
    projectTypes: [
      'Wiring',
      'Panel Upgrade',
      'Lighting',
      'EV Charger',
      'Troubleshooting',
    ],
  },
  {
    id: 'plumbing',
    label: 'Plumbing',
    icon: 'Wrench',
    projectTypes: [
      'Pipe Repair',
      'Fixture Install',
      'Water Heater',
      'Drain Cleaning',
      'Repiping',
    ],
  },
  {
    id: 'handyman',
    label: 'Handyman',
    icon: 'Hammer',
    projectTypes: [
      'General Repair',
      'Assembly',
      'Mounting',
      'Drywall',
      'Odd Jobs',
    ],
  },
  {
    id: 'roofing',
    label: 'Roofing',
    icon: 'Home',
    projectTypes: [
      'Roof Repair',
      'Replacement',
      'Inspection',
      'Gutter Install',
      'Flashing',
    ],
  },
  {
    id: 'hvac',
    label: 'HVAC',
    icon: 'Fan',
    projectTypes: [
      'AC Repair',
      'Furnace Repair',
      'Installation',
      'Duct Cleaning',
      'Maintenance',
    ],
  },
] as const satisfies Industry[]
