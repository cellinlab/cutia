"use client";

import { useTranslation } from "@i18next-toolkit/react";
import { useCallback, useState } from "react";
import { PanelBaseView as BaseView } from "@/components/editor/panels/panel-base-view";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getImageProvider, getVideoProvider } from "@/lib/ai/providers";
import {
	useAIImageGenerationStore,
	type AssetStatus,
	type GeneratedImage,
} from "@/stores/ai-image-generation-store";
import {
	useAIVideoGenerationStore,
	type GeneratedVideo,
} from "@/stores/ai-video-generation-store";
import { useAISettingsStore } from "@/stores/ai-settings-store";
import { useAssetsPanelStore } from "@/stores/assets-panel-store";
import { cn } from "@/utils/ui";
import {
	ImageAdd01Icon,
	Loading03Icon,
	Settings01Icon,
	Video01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

const ASPECT_RATIOS = [
	{ value: "auto", label: "Auto" },
	{ value: "1:1", label: "1:1" },
	{ value: "16:9", label: "16:9" },
	{ value: "9:16", label: "9:16" },
	{ value: "4:3", label: "4:3" },
	{ value: "3:4", label: "3:4" },
] as const;

const VIDEO_DURATIONS = [
	{ value: "4", label: "4s" },
	{ value: "5", label: "5s" },
	{ value: "6", label: "6s" },
	{ value: "8", label: "8s" },
	{ value: "10", label: "10s" },
	{ value: "12", label: "12s" },
] as const;

const VIDEO_ASPECT_RATIOS = [
	{ value: "16:9", label: "16:9" },
	{ value: "9:16", label: "9:16" },
	{ value: "1:1", label: "1:1" },
	{ value: "4:3", label: "4:3" },
	{ value: "3:4", label: "3:4" },
	{ value: "21:9", label: "21:9" },
] as const;

const VIDEO_RESOLUTIONS = [
	{ value: "480p", label: "480p" },
	{ value: "720p", label: "720p" },
	{ value: "1080p", label: "1080p" },
] as const;

function AIImageView() {
	const { t } = useTranslation();
	const { imageProviderId, imageApiKey } = useAISettingsStore();
	const { setActiveTab } = useAssetsPanelStore();

	const {
		prompt,
		aspectRatio,
		isGenerating,
		generatedImages,
		setPrompt,
		setAspectRatio,
		generate,
	} = useAIImageGenerationStore();

	const provider =
		imageProviderId ? getImageProvider({ id: imageProviderId }) : null;

	const isConfigured = provider !== null && imageApiKey.length > 0;

	if (!isConfigured) {
		return (
			<div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
				<HugeiconsIcon
					icon={Settings01Icon}
					className="text-muted-foreground size-10"
				/>
				<div className="flex flex-col gap-1">
					<p className="text-foreground text-sm font-medium">
						{t("No Image Provider Configured")}
					</p>
					<p className="text-muted-foreground text-xs">
						{t(
							"Select a provider and enter your API key in Settings to get started.",
						)}
					</p>
				</div>
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={() => setActiveTab("settings")}
					onKeyDown={(event) => {
						if (event.key === "Enter") setActiveTab("settings");
					}}
				>
					{t("Go to Settings")}
				</Button>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-2">
				<Textarea
					placeholder={t("Describe the image you want to generate...")}
					value={prompt}
					onChange={(event) => setPrompt(event.target.value)}
					rows={4}
					disabled={isGenerating}
					onKeyDown={(event) => {
						if (
							event.key === "Enter" &&
							(event.metaKey || event.ctrlKey)
						) {
							generate();
						}
					}}
				/>

				<div className="flex items-center gap-2">
					<Select value={aspectRatio} onValueChange={setAspectRatio}>
						<SelectTrigger className="w-24">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{ASPECT_RATIOS.map((ratio) => (
								<SelectItem
									key={ratio.value}
									value={ratio.value}
								>
									{ratio.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>

					<Button
						type="button"
						className="flex-1"
						disabled={isGenerating || !prompt.trim()}
						onClick={() => generate()}
						onKeyDown={(event) => {
							if (event.key === "Enter") generate();
						}}
					>
						{isGenerating ? (
							<>
								<HugeiconsIcon
									icon={Loading03Icon}
									className="mr-1 size-4 animate-spin"
								/>
								{t("Generating...")}
							</>
						) : (
							<>
								<HugeiconsIcon
									icon={ImageAdd01Icon}
									className="mr-1 size-4"
								/>
								{t("Generate")}
							</>
						)}
					</Button>
				</div>
			</div>

			{generatedImages.length > 0 && (
				<div className="flex flex-col gap-2">
					<span className="text-muted-foreground text-xs font-medium">
						{t("Generated Images ({{num}})", {
							num: generatedImages.length,
						})}
					</span>
					<div className="grid grid-cols-2 gap-2">
						{generatedImages.map((image) => (
							<GeneratedImageCard
								key={image.id}
								image={image}
							/>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

function AssetStatusBadge({
	status,
	onRetry,
}: {
	status: AssetStatus;
	onRetry: () => void;
}) {
	const { t } = useTranslation();

	if (status === "added") {
		return (
			<div
				className="absolute top-1 right-1 rounded-full bg-green-500/90 p-0.5"
				title={t("Added to assets")}
			>
				<svg
					className="size-3 text-white"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="3"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<title>Added</title>
					<path d="M5 13l4 4L19 7" />
				</svg>
			</div>
		);
	}

	if (status === "pending" || status === "adding") {
		return (
			<div
				className="absolute top-1 right-1"
				title={t("Adding to assets...")}
			>
				<HugeiconsIcon
					icon={Loading03Icon}
					className="size-4 animate-spin text-white drop-shadow"
				/>
			</div>
		);
	}

	if (status === "failed") {
		return (
			<button
				type="button"
				className="absolute top-1 right-1 cursor-pointer rounded-full bg-red-500/90 p-0.5"
				title={t("Failed to add to assets. Click to retry.")}
				onClick={(event) => {
					event.stopPropagation();
					onRetry();
				}}
				onKeyDown={(event) => {
					if (event.key === "Enter") {
						event.stopPropagation();
						onRetry();
					}
				}}
			>
				<svg
					className="size-3 text-white"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="3"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<title>Retry</title>
					<path d="M18 6L6 18M6 6l12 12" />
				</svg>
			</button>
		);
	}

	return null;
}

function GeneratedImageCard({ image }: { image: GeneratedImage }) {
	const [isLoaded, setIsLoaded] = useState(false);
	const [hasError, setHasError] = useState(false);
	const { retryAddToAssets } = useAIImageGenerationStore();

	const handleRetry = useCallback(() => {
		retryAddToAssets(image.id);
	}, [retryAddToAssets, image.id]);

	const showSpinner = !isLoaded && !hasError;

	return (
		<div className="group bg-muted/50 relative overflow-hidden rounded-md border">
			<div className="relative aspect-square w-full overflow-hidden">
				{showSpinner && (
					<div className="bg-muted absolute inset-0 flex items-center justify-center">
						<HugeiconsIcon
							icon={Loading03Icon}
							className="text-muted-foreground size-6 animate-spin"
						/>
					</div>
				)}
				{/* biome-ignore lint: external URL, can't use Next Image */}
				<img
					src={image.url}
					alt="AI generated result"
					className={cn(
						"h-full w-full object-cover transition-opacity",
						isLoaded ? "opacity-100" : "opacity-0",
					)}
					onLoad={() => {
						setIsLoaded(true);
						setHasError(false);
					}}
					onError={() => setHasError(true)}
				/>
				<AssetStatusBadge
					status={image.assetStatus}
					onRetry={handleRetry}
				/>
			</div>
		</div>
	);
}

function AIVideoView() {
	const { t } = useTranslation();
	const { videoProviderId, videoApiKey } = useAISettingsStore();
	const { setActiveTab } = useAssetsPanelStore();

	const {
		prompt,
		duration,
		aspectRatio: videoAspectRatio,
		resolution,
		isGenerating,
		generatedVideos,
		setPrompt,
		setDuration,
		setAspectRatio: setVideoAspectRatio,
		setResolution,
		generate,
	} = useAIVideoGenerationStore();

	const provider =
		videoProviderId ? getVideoProvider({ id: videoProviderId }) : null;

	const isConfigured = provider !== null && videoApiKey.length > 0;

	if (!isConfigured) {
		return (
			<div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
				<HugeiconsIcon
					icon={Settings01Icon}
					className="text-muted-foreground size-10"
				/>
				<div className="flex flex-col gap-1">
					<p className="text-foreground text-sm font-medium">
						{t("No Video Provider Configured")}
					</p>
					<p className="text-muted-foreground text-xs">
						{t(
							"Select a provider and enter your API key in Settings to get started.",
						)}
					</p>
				</div>
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={() => setActiveTab("settings")}
					onKeyDown={(event) => {
						if (event.key === "Enter") setActiveTab("settings");
					}}
				>
					{t("Go to Settings")}
				</Button>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-2">
				<Textarea
					placeholder={t(
						"Describe the video you want to generate...",
					)}
					value={prompt}
					onChange={(event) => setPrompt(event.target.value)}
					rows={4}
					disabled={isGenerating}
					onKeyDown={(event) => {
						if (
							event.key === "Enter" &&
							(event.metaKey || event.ctrlKey)
						) {
							generate();
						}
					}}
				/>

				<div className="flex items-center gap-2">
					<Select
						value={String(duration)}
						onValueChange={(value) => setDuration(Number(value))}
					>
						<SelectTrigger className="w-[72px]">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{VIDEO_DURATIONS.map((option) => (
								<SelectItem
									key={option.value}
									value={option.value}
								>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>

					<Select
						value={videoAspectRatio}
						onValueChange={setVideoAspectRatio}
					>
						<SelectTrigger className="w-[72px]">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{VIDEO_ASPECT_RATIOS.map((option) => (
								<SelectItem
									key={option.value}
									value={option.value}
								>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>

					<Select value={resolution} onValueChange={setResolution}>
						<SelectTrigger className="w-[72px]">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{VIDEO_RESOLUTIONS.map((option) => (
								<SelectItem
									key={option.value}
									value={option.value}
								>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<Button
					type="button"
					disabled={isGenerating || !prompt.trim()}
					onClick={() => generate()}
					onKeyDown={(event) => {
						if (event.key === "Enter") generate();
					}}
				>
					{isGenerating ? (
						<>
							<HugeiconsIcon
								icon={Loading03Icon}
								className="mr-1 size-4 animate-spin"
							/>
							{t("Submitting...")}
						</>
					) : (
						<>
							<HugeiconsIcon
								icon={Video01Icon}
								className="mr-1 size-4"
							/>
							{t("Generate Video")}
						</>
					)}
				</Button>
			</div>

			{generatedVideos.length > 0 && (
				<div className="flex flex-col gap-2">
					<span className="text-muted-foreground text-xs font-medium">
						{t("Generated Videos ({{num}})", {
							num: generatedVideos.length,
						})}
					</span>
					<div className="flex flex-col gap-2">
						{generatedVideos.map((video) => (
							<GeneratedVideoCard
								key={video.id}
								video={video}
							/>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

function VideoStatusBadge({
	video,
	onRetry,
}: {
	video: GeneratedVideo;
	onRetry: () => void;
}) {
	const { t } = useTranslation();

	const isTaskRunning =
		video.taskStatus === "pending" || video.taskStatus === "running";

	if (isTaskRunning) {
		return (
			<div className="flex items-center gap-1.5 text-xs">
				<HugeiconsIcon
					icon={Loading03Icon}
					className="size-3.5 animate-spin text-blue-500"
				/>
				<span className="text-muted-foreground">
					{t("Generating...")}
				</span>
			</div>
		);
	}

	if (video.taskStatus === "failed") {
		return (
			<span className="text-xs text-red-500">
				{video.error ?? t("Failed")}
			</span>
		);
	}

	if (video.assetStatus === "adding") {
		return (
			<div className="flex items-center gap-1.5 text-xs">
				<HugeiconsIcon
					icon={Loading03Icon}
					className="size-3.5 animate-spin text-blue-500"
				/>
				<span className="text-muted-foreground">
					{t("Adding to assets...")}
				</span>
			</div>
		);
	}

	if (video.assetStatus === "added") {
		return (
			<span className="text-xs text-green-600">{t("Added to assets")}</span>
		);
	}

	if (video.assetStatus === "failed") {
		return (
			<button
				type="button"
				className="cursor-pointer text-xs text-red-500 underline"
				onClick={onRetry}
				onKeyDown={(event) => {
					if (event.key === "Enter") onRetry();
				}}
			>
				{t("Failed to add. Click to retry.")}
			</button>
		);
	}

	return null;
}

function GeneratedVideoCard({ video }: { video: GeneratedVideo }) {
	const { t } = useTranslation();
	const { retryAddToAssets } = useAIVideoGenerationStore();

	const handleRetry = useCallback(() => {
		retryAddToAssets(video.id);
	}, [retryAddToAssets, video.id]);

	const isTaskRunning =
		video.taskStatus === "pending" || video.taskStatus === "running";

	return (
		<div className="bg-muted/50 overflow-hidden rounded-md border p-3">
			<p className="text-foreground mb-2 line-clamp-2 text-xs">
				{video.prompt}
			</p>

			{video.videoUrl && (
				<div className="mb-2 overflow-hidden rounded">
					<video
						src={video.videoUrl}
						controls
						className="w-full"
						preload="metadata"
					>
						<track kind="captions" />
					</video>
				</div>
			)}

			{isTaskRunning && !video.videoUrl && (
				<div className="bg-muted mb-2 flex aspect-video items-center justify-center rounded">
					<div className="flex flex-col items-center gap-2">
						<HugeiconsIcon
							icon={Loading03Icon}
							className="text-muted-foreground size-8 animate-spin"
						/>
						<span className="text-muted-foreground text-xs">
							{t("Generating video...")}
						</span>
					</div>
				</div>
			)}

			<VideoStatusBadge video={video} onRetry={handleRetry} />
		</div>
	);
}

export function AIView() {
	const { t } = useTranslation();

	return (
		<BaseView
			defaultTab="ai-image"
			tabs={[
				{
					value: "ai-image",
					label: t("AI Image"),
					content: <AIImageView />,
				},
				{
					value: "ai-video",
					label: t("AI Video"),
					content: <AIVideoView />,
				},
			]}
			className="flex h-full flex-col"
		/>
	);
}
