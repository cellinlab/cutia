import { Input, ALL_FORMATS, BlobSource, VideoSampleSink } from "mediabunny";

interface SinkData {
	sink: VideoSampleSink;
}

const MAX_CACHED_THUMBNAILS = 500;

class TimelineThumbnailCache {
	private thumbnails = new Map<string, ImageBitmap>();
	private sinks = new Map<string, SinkData>();
	private initPromises = new Map<string, Promise<SinkData | null>>();
	private pending = new Map<string, Promise<ImageBitmap | null>>();

	async getThumbnail({
		mediaId,
		file,
		time,
		fps,
	}: {
		mediaId: string;
		file: File;
		time: number;
		fps: number;
	}): Promise<ImageBitmap | null> {
		const snappedTime = Math.floor(time * fps) / fps;
		const key = `${mediaId}:${snappedTime.toFixed(4)}`;

		const cached = this.thumbnails.get(key);
		if (cached) return cached;

		const pendingPromise = this.pending.get(key);
		if (pendingPromise) return pendingPromise;

		const promise = this.generateThumbnail({
			mediaId,
			file,
			time: snappedTime,
			key,
		});
		this.pending.set(key, promise);

		try {
			return await promise;
		} finally {
			this.pending.delete(key);
		}
	}

	getCachedThumbnail({
		mediaId,
		time,
		fps,
	}: {
		mediaId: string;
		time: number;
		fps: number;
	}): ImageBitmap | null {
		const snappedTime = Math.floor(time * fps) / fps;
		const key = `${mediaId}:${snappedTime.toFixed(4)}`;
		return this.thumbnails.get(key) ?? null;
	}

	getNearestCachedThumbnail({
		mediaId,
		time,
	}: {
		mediaId: string;
		time: number;
	}): ImageBitmap | null {
		let nearest: ImageBitmap | null = null;
		let nearestDist = Infinity;

		const prefix = `${mediaId}:`;
		for (const [key, bitmap] of this.thumbnails) {
			if (!key.startsWith(prefix)) continue;
			const cachedTime = Number.parseFloat(key.slice(prefix.length));
			const dist = Math.abs(cachedTime - time);
			if (dist < nearestDist) {
				nearestDist = dist;
				nearest = bitmap;
			}
		}

		return nearest;
	}

	clearMedia({ mediaId }: { mediaId: string }): void {
		this.sinks.delete(mediaId);
		this.initPromises.delete(mediaId);

		for (const [key, bitmap] of this.thumbnails) {
			if (key.startsWith(`${mediaId}:`)) {
				bitmap.close();
				this.thumbnails.delete(key);
			}
		}
	}

	clearAll(): void {
		for (const [, bitmap] of this.thumbnails) {
			bitmap.close();
		}
		this.thumbnails.clear();
		this.sinks.clear();
		this.initPromises.clear();
		this.pending.clear();
	}

	private async generateThumbnail({
		mediaId,
		file,
		time,
		key,
	}: {
		mediaId: string;
		file: File;
		time: number;
		key: string;
	}): Promise<ImageBitmap | null> {
		const sinkData = await this.ensureSink({ mediaId, file });
		if (!sinkData) return null;

		try {
			const sample = await sinkData.sink.getSample(time);
			if (!sample) return null;

			try {
				const canvas = new OffscreenCanvas(
					sample.codedWidth,
					sample.codedHeight,
				);
				const ctx = canvas.getContext("2d");
				if (!ctx) return null;

				sample.draw(ctx, 0, 0, sample.codedWidth, sample.codedHeight);

				const bitmap = await createImageBitmap(canvas);
				this.evictIfNeeded();
				this.thumbnails.set(key, bitmap);
				return bitmap;
			} finally {
				sample.close();
			}
		} catch (error) {
			console.warn(`Failed to get thumbnail for ${mediaId} at ${time}:`, error);
			return null;
		}
	}

	private evictIfNeeded(): void {
		if (this.thumbnails.size < MAX_CACHED_THUMBNAILS) return;

		const keysToRemove = Array.from(this.thumbnails.keys()).slice(
			0,
			Math.floor(MAX_CACHED_THUMBNAILS * 0.2),
		);
		for (const key of keysToRemove) {
			const bitmap = this.thumbnails.get(key);
			if (bitmap) bitmap.close();
			this.thumbnails.delete(key);
		}
	}

	private async ensureSink({
		mediaId,
		file,
	}: {
		mediaId: string;
		file: File;
	}): Promise<SinkData | null> {
		const existing = this.sinks.get(mediaId);
		if (existing) return existing;

		const existingPromise = this.initPromises.get(mediaId);
		if (existingPromise) return existingPromise;

		const promise = this.initializeSink({ mediaId, file });
		this.initPromises.set(mediaId, promise);

		try {
			return await promise;
		} finally {
			this.initPromises.delete(mediaId);
		}
	}

	private async initializeSink({
		mediaId,
		file,
	}: {
		mediaId: string;
		file: File;
	}): Promise<SinkData | null> {
		try {
			const input = new Input({
				source: new BlobSource(file),
				formats: ALL_FORMATS,
			});

			const videoTrack = await input.getPrimaryVideoTrack();
			if (!videoTrack) return null;

			const canDecode = await videoTrack.canDecode();
			if (!canDecode) return null;

			const sink = new VideoSampleSink(videoTrack);
			const data: SinkData = { sink };
			this.sinks.set(mediaId, data);
			return data;
		} catch (error) {
			console.error(
				`Failed to init thumbnail sink for ${mediaId}:`,
				error,
			);
			return null;
		}
	}
}

export const timelineThumbnailCache = new TimelineThumbnailCache();
