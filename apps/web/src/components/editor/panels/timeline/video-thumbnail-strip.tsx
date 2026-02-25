"use client";

import { useEffect, useRef, useCallback } from "react";
import { TIMELINE_CONSTANTS } from "@/constants/timeline-constants";
import { timelineThumbnailCache } from "@/services/timeline-thumbnail/service";

interface VideoThumbnailStripProps {
	mediaId: string;
	file: File;
	trimStart: number;
	duration: number;
	elementWidth: number;
	trackHeight: number;
	zoomLevel: number;
	fps: number;
	mediaWidth: number;
	mediaHeight: number;
	isSelected: boolean;
}

function drawCoverCrop({
	ctx,
	image,
	destX,
	destY,
	destWidth,
	destHeight,
}: {
	ctx: CanvasRenderingContext2D;
	image: ImageBitmap;
	destX: number;
	destY: number;
	destWidth: number;
	destHeight: number;
}): void {
	const sourceAspect = image.width / image.height;
	const destAspect = destWidth / destHeight;

	let sx: number;
	let sy: number;
	let sw: number;
	let sh: number;

	if (sourceAspect > destAspect) {
		sh = image.height;
		sw = image.height * destAspect;
		sx = (image.width - sw) / 2;
		sy = 0;
	} else {
		sw = image.width;
		sh = image.width / destAspect;
		sx = 0;
		sy = (image.height - sh) / 2;
	}

	ctx.drawImage(image, sx, sy, sw, sh, destX, destY, destWidth, destHeight);
}

export function VideoThumbnailStrip({
	mediaId,
	file,
	trimStart,
	duration,
	elementWidth,
	trackHeight,
	zoomLevel,
	fps,
	mediaWidth,
	mediaHeight,
	isSelected,
}: VideoThumbnailStripProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const renderIdRef = useRef(0);

	const tileAspect = mediaWidth / mediaHeight;
	const tileWidth = Math.round(trackHeight * tileAspect);
	const drawHeight = isSelected ? trackHeight - 8 : trackHeight;
	const drawOffsetY = isSelected ? 4 : 0;

	const renderThumbnails = useCallback(async () => {
		const renderId = ++renderIdRef.current;
		const canvas = canvasRef.current;
		if (!canvas) return;

		const dpr = window.devicePixelRatio || 1;
		const canvasWidth = Math.ceil(elementWidth);
		const canvasHeight = trackHeight;

		canvas.width = canvasWidth * dpr;
		canvas.height = canvasHeight * dpr;
		canvas.style.width = `${canvasWidth}px`;
		canvas.style.height = `${canvasHeight}px`;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, canvasWidth, canvasHeight);

		const tileCount = Math.ceil(canvasWidth / tileWidth);
		const pixelsPerSecond =
			TIMELINE_CONSTANTS.PIXELS_PER_SECOND * zoomLevel;

		const frameTimes: number[] = [];
		for (let i = 0; i < tileCount; i++) {
			const timeOffset = (i * tileWidth) / pixelsPerSecond;
			const videoTime = trimStart + timeOffset;
			const clampedTime = Math.min(videoTime, trimStart + duration);
			frameTimes.push(clampedTime);
		}

		const needsAsyncLoad: number[] = [];

		for (let i = 0; i < frameTimes.length; i++) {
			const exact = timelineThumbnailCache.getCachedThumbnail({
				mediaId,
				time: frameTimes[i],
				fps,
			});
			const fallback =
				exact ??
				timelineThumbnailCache.getNearestCachedThumbnail({
					mediaId,
					time: frameTimes[i],
				});

			if (fallback) {
				drawCoverCrop({
					ctx,
					image: fallback,
					destX: i * tileWidth,
					destY: drawOffsetY,
					destWidth: tileWidth,
					destHeight: drawHeight,
				});
			}

			if (!exact) {
				needsAsyncLoad.push(i);
			}
		}

		for (const i of needsAsyncLoad) {
			if (renderId !== renderIdRef.current) return;

			const thumbnail = await timelineThumbnailCache.getThumbnail({
				mediaId,
				file,
				time: frameTimes[i],
				fps,
			});

			if (renderId !== renderIdRef.current) return;
			if (!thumbnail) continue;

			drawCoverCrop({
				ctx,
				image: thumbnail,
				destX: i * tileWidth,
				destY: drawOffsetY,
				destWidth: tileWidth,
				destHeight: drawHeight,
			});
		}
	}, [
		mediaId,
		file,
		trimStart,
		duration,
		elementWidth,
		trackHeight,
		zoomLevel,
		fps,
		tileWidth,
		drawHeight,
		drawOffsetY,
	]);

	useEffect(() => {
		renderThumbnails();
	}, [renderThumbnails]);

	return (
		<canvas
			ref={canvasRef}
			className="pointer-events-none absolute inset-0"
		/>
	);
}
