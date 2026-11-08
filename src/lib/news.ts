/**
 * "Cool News!!" items shown on the student dashboard (rotating card) and on
 * /dashboard/news. Newest first. To add news: drop the image into
 * public/news/ and add an entry here.
 *
 * fit: "cover" fills the card edge to edge (posters); "contain" shows the
 * whole picture over a blurred copy of itself (wide photos with text).
 */
export type NewsItem = {
  id: string;
  title: string;
  image: string;
  alt: string;
  date: string; // ISO date, shown on the news page
  fit: "cover" | "contain";
};

export const NEWS: NewsItem[] = [
  {
    id: "ideathon-2026",
    title: "ორდღიანი იდეათონი - SkillWill × Plug and Play, 7-8 ნოემბერი, 10:00-18:00",
    image: "/news/ideathon-2026.webp",
    alt: "SkillWill College × Plug and Play two-day ideathon poster, 7-8 November, 10:00-18:00",
    date: "2026-11-07",
    fit: "cover",
  },
  {
    id: "plug-and-play-memorandum",
    title: "SKILLWILL Swiss College-სა და Plug and Play-ს შორის თანამშრომლობის მემორანდუმი გაფორმდა",
    image: "/news/plug-and-play-memorandum.webp",
    alt: "SKILLWILL Swiss College and Plug and Play representatives shaking hands after signing a memorandum of cooperation",
    date: "2026-11-05",
    fit: "contain",
  },
];

/** How long each news item stays on screen in the dashboard card. */
export const NEWS_ROTATE_MS = 4000;
