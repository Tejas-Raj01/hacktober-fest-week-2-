export interface Quest {
  id: number;
  targetKeyword: string;
  title: string;
  description: string;
  points: number;
}

/**
 * COCO-compatible outdoor quest list.
 * Every targetKeyword strictly matches a validated class from the COCO dataset
 * recognized by the Xenova/detr-resnet-50 object detection model.
 */
export const QUESTS: Quest[] = [
  {
    id: 1,
    targetKeyword: "bench",
    title: "Park Rest Stop",
    description: "Find a park bench and snap a photo of it.",
    points: 10,
  },
  {
    id: 2,
    targetKeyword: "stop sign",
    title: "The Red Octagon",
    description: "Locate a stop sign at an intersection.",
    points: 10,
  },
  {
    id: 3,
    targetKeyword: "fire hydrant",
    title: "Water Source",
    description: "Find a fire hydrant on the sidewalk.",
    points: 10,
  },
  {
    id: 4,
    targetKeyword: "potted plant",
    title: "Urban Jungle",
    description: "Find a plant growing inside a pot or planter.",
    points: 10,
  },
  {
    id: 5,
    targetKeyword: "bird",
    title: "Avian Observer",
    description: "Spot a bird outside and capture it in frame.",
    points: 10,
  },
  {
    id: 6,
    targetKeyword: "bicycle",
    title: "Two Wheels",
    description: "Find a parked or moving bicycle.",
    points: 10,
  },
  {
    id: 7,
    targetKeyword: "dog",
    title: "Man's Best Friend",
    description: "Find a dog out for a walk.",
    points: 10,
  },
];

export default QUESTS;
