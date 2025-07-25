import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// 为高德API响应定义Zod schema，以便进行类型检查
const AmapGeocodeResponse = z.object({
	status: z.string(),
	info: z.string(),
	geocodes: z.array(
		z.object({
			formatted_address: z.string(),
			location: z.string(),
            adcode: z.string(),
		})
	).optional(),
});

const AmapWeatherResponse = z.object({
    status: z.string(),
    info: z.string(),
    lives: z.array(
        z.object({
            province: z.string(),
            city: z.string(),
            adcode: z.string(),
            weather: z.string(),
            temperature: z.string(),
            winddirection: z.string(),
            windpower: z.string(),
            humidity: z.string(),
            reporttime: z.string(),
        })
    ).optional(),
});


export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "Amap Tools",
		version: "1.0.0",
	});

	async init() {
		// 地理编码工具: 将地址转换为经纬度
		this.server.tool(
			"geocode",
			{
				address: z.string().describe("需要进行地理编码的地址"),
				city: z.string().optional().describe("地址所在的城市"),
			},
			async ({ address, city }, context) => {
				const apiKey = context.env.AMAP_MAPS_API_KEY;
				if (!apiKey) {
					return {
						content: [{ type: "text", text: "错误: AMAP_MAPS_API_KEY 未配置。" }],
					};
				}
				const url = `https://restapi.amap.com/v3/geocode/geo?address=${encodeURIComponent(
					address
				)}&city=${encodeURIComponent(city || "")}&key=${apiKey}`;

				try {
					const response = await fetch(url);
					const data = await response.json();
                    const parsed = AmapGeocodeResponse.parse(data);

					if (parsed.status === "1" && parsed.geocodes && parsed.geocodes.length > 0) {
						return {
							content: [{ type: "text", text: JSON.stringify(parsed.geocodes) }],
						};
					}
					return { content: [{ type: "text", text: `错误: ${parsed.info}` }] };
				} catch (error) {
					return {
						content: [{ type: "text", text: `获取地理编码数据时出错: ${error.message}` }],
					};
				}
			}
		);

        // 天气查询工具
		this.server.tool(
			"weather_query",
			{
				city: z.string().describe("需要查询天气的城市名称"),
			},
			async ({ city }, context) => {
				const apiKey = context.env.AMAP_MAPS_API_KEY;
				if (!apiKey) {
					return {
						content: [{ type: "text", text: "错误: AMAP_MAPS_API_KEY 未配置。" }],
					};
				}

                // 天气查询需要城市的adcode，所以先通过地理编码获取
                const geocodeUrl = `https://restapi.amap.com/v3/geocode/geo?address=${encodeURIComponent(city)}&key=${apiKey}`;
                let adcode = "";
                try {
                    const geoResponse = await fetch(geocodeUrl);
                    const geoData = await geoResponse.json();
                    const parsedGeo = AmapGeocodeResponse.parse(geoData);
                     if (parsedGeo.status === "1" && parsedGeo.geocodes && parsedGeo.geocodes.length > 0) {
                        adcode = parsedGeo.geocodes[0].adcode;
                    } else {
                        return { content: [{ type: "text", text: `无法找到城市: ${city}`}]};
                    }
                } catch(e) {
                     return { content: [{ type: "text", text: "获取城市adcode时出错。"}]};
                }


				const weatherUrl = `https://restapi.amap.com/v3/weather/weatherInfo?city=${adcode}&key=${apiKey}`;

				try {
					const response = await fetch(weatherUrl);
					const data = await response.json();
                    const parsed = AmapWeatherResponse.parse(data);

					if (parsed.status === "1" && parsed.lives && parsed.lives.length > 0) {
						return {
							content: [{ type: "text", text: JSON.stringify(parsed.lives[0]) }],
						};
					}
					return { content: [{ type: "text", text: `错误: ${parsed.info}` }] };
				} catch (error) {
					return {
						content: [{ type: "text", text: `获取天气数据时出错: ${error.message}` }],
					};
				}
			}
		);

		// 您可以在此处添加其他高德地图工具，例如逆地理编码、路径规划等。
	}
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        // 确保您的环境中已设置AMAP_MAPS_API_KEY
        const workerEnv = { ...env };

		const url = new URL(request.url);

		if (url.pathname === "/sse" || url.pathname === "/sse/message") {
			return MyMCP.serveSSE("/sse").fetch(request, workerEnv, ctx);
		}

		if (url.pathname === "/mcp") {
			return MyMCP.serve("/mcp").fetch(request, workerEnv, ctx);
		}

		return new Response("Not found", { status: 404 });
	},
};
