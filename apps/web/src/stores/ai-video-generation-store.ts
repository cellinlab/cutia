import { i18next } from "@i18next-toolkit/react";
import { create } from "zustand";
import { toast } from "sonner";
import { EditorCore } from "@/core";
import { getVideoProvider } from "@/lib/ai/providers";
import type { VideoTaskStatus } from "@/lib/ai/providers/types";
import { pollVideoTask } from "@/lib/ai/providers/seedance";
import { processMediaAssets } from "@/lib/media/processing";
import { fetchWithProxyFallback } from "@/lib/media/url-import";
import { useAISettingsStore } from "./ai-settings-store";
import { generateUUID } from "@/utils/id";

export type VideoAssetStatus = "pending" | "adding" | "added" | "failed";

export interface GeneratedVideo {
	id: string;
	prompt: string;
	taskId: string;
	taskStatus: VideoTaskStatus;
	videoUrl?: string;
	assetStatus: VideoAssetStatus;
	error?: string;
}

interface AIVideoGenerationState {
	prompt: string;
	duration: number;
	aspectRatio: string;
	resolution: string;
	isGenerating: boolean;
	generatedVideos: GeneratedVideo[];

	setPrompt: (prompt: string) => void;
	setDuration: (duration: number) => void;
	setAspectRatio: (aspectRatio: string) => void;
	setResolution: (resolution: string) => void;
	generate: () => Promise<void>;
	retryAddToAssets: (videoId: string) => void;
	clearVideos: () => void;
}

function updateVideo({
	videoId,
	updates,
}: {
	videoId: string;
	updates: Partial<GeneratedVideo>;
}): void {
	useAIVideoGenerationStore.setState((state) => ({
		generatedVideos: state.generatedVideos.map((video) =>
			video.id === videoId ? { ...video, ...updates } : video,
		),
	}));
}

async function downloadAndAddToAssets({
	videoId,
	videoUrl,
}: {
	videoId: string;
	videoUrl: string;
}): Promise<void> {
	const editor = EditorCore.getInstance();
	const project = editor.project.getActiveOrNull();
	if (!project) {
		updateVideo({ videoId, updates: { assetStatus: "failed" } });
		return;
	}

	updateVideo({ videoId, updates: { assetStatus: "adding" } });

	try {
		const blob = await fetchWithProxyFallback({ url: videoUrl });
		const filename = `ai-video-${videoId.slice(0, 8)}.mp4`;
		const file = new File([blob], filename, {
			type: blob.type || "video/mp4",
		});

		const processedAssets = await processMediaAssets({ files: [file] });

		for (const asset of processedAssets) {
			await editor.media.addMediaAsset({
				projectId: project.metadata.id,
				asset,
			});
		}

		updateVideo({ videoId, updates: { assetStatus: "added" } });
	} catch (error) {
		console.error("Failed to add AI video to assets:", error);
		updateVideo({ videoId, updates: { assetStatus: "failed" } });
	}
}

export const useAIVideoGenerationStore = create<AIVideoGenerationState>()(
	(set, get) => ({
		prompt: "",
		duration: 5,
		aspectRatio: "16:9",
		resolution: "720p",
		isGenerating: false,
		generatedVideos: [],

		setPrompt: (prompt) => set({ prompt }),
		setDuration: (duration) => set({ duration }),
		setAspectRatio: (aspectRatio) => set({ aspectRatio }),
		setResolution: (resolution) => set({ resolution }),

		generate: async () => {
			if (get().isGenerating) return;

			const { videoProviderId, videoApiKey } =
				useAISettingsStore.getState();

			if (!videoProviderId) {
				toast.error(
					i18next.t("Please configure a video provider in Settings"),
				);
				return;
			}

			const provider = getVideoProvider({ id: videoProviderId });
			if (!provider || !videoApiKey) {
				toast.error(
					i18next.t("Please configure a video provider in Settings"),
				);
				return;
			}

			const { prompt, duration, aspectRatio, resolution } = get();
			const trimmedPrompt = prompt.trim();
			if (!trimmedPrompt) {
				toast.error(i18next.t("Please enter a prompt"));
				return;
			}

			set({ isGenerating: true });

			try {
				const submitResult = await provider.submitVideoTask({
					request: {
						prompt: trimmedPrompt,
						duration,
						aspectRatio,
						resolution,
					},
					apiKey: videoApiKey,
				});

				const videoId = generateUUID();
				const newVideo: GeneratedVideo = {
					id: videoId,
					prompt: trimmedPrompt,
					taskId: submitResult.taskId,
					taskStatus: submitResult.status,
					assetStatus: "pending",
				};

				set((state) => ({
					generatedVideos: [newVideo, ...state.generatedVideos],
					isGenerating: false,
				}));

				toast.success(i18next.t("Video generation task submitted"));

				void pollAndUpdate({
					provider,
					videoId,
					taskId: submitResult.taskId,
					apiKey: videoApiKey,
				});
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: i18next.t("Video generation failed");
				toast.error(message);
				set({ isGenerating: false });
			}
		},

		retryAddToAssets: (videoId) => {
			const video = get().generatedVideos.find((v) => v.id === videoId);
			if (video?.videoUrl) {
				void downloadAndAddToAssets({
					videoId: video.id,
					videoUrl: video.videoUrl,
				});
			}
		},

		clearVideos: () => {
			set({ generatedVideos: [] });
		},
	}),
);

async function pollAndUpdate({
	provider,
	videoId,
	taskId,
	apiKey,
}: {
	provider: ReturnType<typeof getVideoProvider>;
	videoId: string;
	taskId: string;
	apiKey: string;
}): Promise<void> {
	if (!provider) return;

	try {
		const finalResult = await pollVideoTask({
			provider,
			taskId,
			apiKey,
			onProgress: (result) => {
				updateVideo({
					videoId,
					updates: {
						taskStatus: result.status,
						videoUrl: result.videoUrl,
						error: result.error,
					},
				});
			},
		});

		if (finalResult.status === "succeeded" && finalResult.videoUrl) {
			updateVideo({
				videoId,
				updates: {
					taskStatus: "succeeded",
					videoUrl: finalResult.videoUrl,
				},
			});

			toast.success(i18next.t("Video generation completed"));

			void downloadAndAddToAssets({
				videoId,
				videoUrl: finalResult.videoUrl,
			});
		} else if (finalResult.status === "failed") {
			updateVideo({
				videoId,
				updates: {
					taskStatus: "failed",
					error: finalResult.error ?? i18next.t("Video generation failed"),
				},
			});
			toast.error(
				finalResult.error ?? i18next.t("Video generation failed"),
			);
		}
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: i18next.t("Failed to check video status");
		updateVideo({
			videoId,
			updates: { taskStatus: "failed", error: message },
		});
		toast.error(message);
	}
}
