import type {
	ExpressiveCodeConfig,
	LicenseConfig,
	NavBarConfig,
	ProfileConfig,
	SiteConfig,
} from "./types/config";
import { LinkPreset } from "./types/config";

export const siteConfig: SiteConfig = {
	title: "顶呱呱的快乐",
	keywords: "雾创岛,初春网络,初春网络旗下资源站,资源分享,资源网,PC 软件,PC 软件下载,安卓应用,安卓 APP, 实用 APP, 源码,源码分享,开源源码,优质资源,免费资源,无广告资源,绿色软件,手机应用,精品资源,资源合集,资源平台,软件下载,应用推荐,源码下载,雾创岛资源,综合资源网,技术教程,EdgeOne 教程,EdgeOne 配置,Cloudflare 教程,Cloudflare 设置,CDN 技术教程,EdgeOne 使用指南,Cloudflare 优化教程,网络技术教程,服务器技术教程,站长技术资讯,网站技术教程,建站技术分享,服务器运维教程,网站搭建教程,站长工具资源,网站优化技术,服务器配置教程,网站安全技术,站长资源分享,网站源码教程,CDN 站长工具,EdgeOne 站长指南,Cloudflare 站长教程",
	description: "顶呱呱的快乐的个人博客，记录日常、医学学习与技术实践。",
	lang: "zh_CN", // Language code, e.g. 'en', 'zh_CN', 'ja', etc.
	themeColor: {
		hue: 250, // Default hue for the theme color, from 0 to 360. e.g. red: 0, teal: 200, cyan: 250, pink: 345
		fixed: true, // Hide the theme color picker for visitors
	},
	banner: {
		enable: true,
		src: "https://wuw.li/r2-assets/tu/2026-07-22T15-e21iq.webp",
		position: "center", // Equivalent to object-position, only supports 'top', 'center', 'bottom'. 'center' by default
		credit: {
			enable: false, // Display the credit text of the banner image
			text: "", // Credit text to be displayed
			url: "", // (Optional) URL link to the original artwork or artist's page
		},
	},
	toc: {
		enable: true, // Display the table of contents on the right side of the post
		depth: 2, // Maximum heading depth to show in the table, from 1 to 3
	},
	favicon: [
		// Leave this array empty to use the default favicon
		{
			src: "/favicon.ico", // Path of the favicon, relative to the /public directory
			theme: "light", // (Optional) Either 'light' or 'dark', set only if you have different favicons for light and dark mode
			sizes: "32x32", // (Optional) Size of the favicon, set only if you have favicons of different sizes
		},
	],
};

export const navBarConfig: NavBarConfig = {
	links: [
		LinkPreset.Home,
		LinkPreset.Archive,
		LinkPreset.About,
		{
			name: "友情链接",
			url: "/friends/",
			external: false,
		}
	],
};

export const profileConfig: ProfileConfig = {
	title: "顶呱呱的快乐",
	avatar: "https://wuw.wuw.li/upload/22d58783-419b-4e47-896c-1ead007216ed.png",
	name: "顶呱呱的快乐",
	bio: "少年心气是不可再生之物",
	links: [
		{
			name: "Home",
			icon: "fa6-brands:chrome",
			url: "https://wuw.li",
		},
		{
			name: "GitHub",
			icon: "fa6-brands:github",
			url: "https://github.com/qiailmy",
		},
	],
	icp: ""
};

export const licenseConfig: LicenseConfig = {
	enable: true,
	name: "CC BY-NC-SA 4.0",
	url: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
};

export const expressiveCodeConfig: ExpressiveCodeConfig = {
	// Note: Some styles (such as background color) are being overridden, see the astro.config.mjs file.
	// Please select a dark theme, as this blog theme currently only supports dark background color
	theme: "github-dark",
};

export const friends = [
	{
		name: "楠笙",
		url: "https://blog.nanshengwx.cn/",
		avatar: "https://blog.nanshengwx.cn/upload/logo.png",
		description: "空谈误国，实干兴邦",
	},
	{
		name: "Serenite",
		url: "https://blog.shiina.fun/",
		avatar: "https://blog.shiina.fun/wp-content/uploads/2023/10/cropped-lieca5.0_20220630_150846363-scaled-e1696390999120.webp",
		description: "Mindblowing Meteorology Student",
	},
	{
		name: "小林的小窝",
		url: "https://www.xiaorin.com/",
		avatar: "https://www.xiaorin.com/Image.jpg",
		description: "",
	},
	{
		name: "GTX690战术核显卡导弹的猫窝",
		url: "https://nekopara.uk",
		avatar: "https://logo.nekopara.uk/logo.jpg",
		description: "一个过气UP的博客，喜欢计算机技术，希望交个朋友",
	},
	{
		name: "企鹅的博客_",
		url: "https://www.lydqe.com.cn/",
		avatar: "https://www.lydqe.com.cn/upload/logo.jpg?width=800",
		description: "",
	},
	{
		name: "dsvideo",
		url: "https://dsvideo.top",
		avatar: "https://dsvideo.top/upload/7.jpg",
		description: "命理探秘与科技前沿",
	},
	{
		name: "博客大联盟",
		url: "https://bo.ke/",
		avatar: "https://bo.ke/assets/logo-dark.svg",
		description: "",
	},
];
