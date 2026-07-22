import { getCollection } from "astro:content";
import type { APIRoute } from "astro";

const robotsTxt = `
User-agent: *
Disallow: /_astro/

Sitemap: ${new URL("sitemap-index.xml", import.meta.env.SITE).href}
`.trim();

export const GET: APIRoute = async () => {
	const articles = await getCollection("posts");
	return new Response(JSON.stringify(articles), {
		headers: {
			"Content-Type": "application/json",
		},
	});
};
