"use client";

import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { decodeAudioToFloat32 } from "@/lib/media/audio";
import { transcriptionService } from "@/services/transcription/service";
import { buildCaptionChunks } from "@/lib/transcription/caption";
import {
	TRANSCRIPTION_MODELS,
	TRANSCRIPTION_LANGUAGES,
	DEFAULT_TRANSCRIPTION_MODEL,
	DEFAULT_WORDS_PER_CAPTION,
} from "@/constants/transcription-constants";
import type {
	TranscriptionResult,
	TranscriptionProgress,
	TranscriptionModelId,
	TranscriptionLanguage,
	CaptionChunk,
} from "@/types/transcription";

function formatTimestamp({ seconds }: { seconds: number }): string {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const secs = Math.floor(seconds % 60);
	const ms = Math.round((seconds % 1) * 1000);

	return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

function getStatusLabel({
	status,
}: {
	status: TranscriptionProgress["status"];
}): string {
	const labels: Record<TranscriptionProgress["status"], string> = {
		idle: "Idle",
		"loading-model": "Loading Model",
		transcribing: "Transcribing",
		complete: "Complete",
		error: "Error",
	};
	return labels[status];
}

function getStatusVariant({
	status,
}: {
	status: TranscriptionProgress["status"];
}): "default" | "secondary" | "destructive" | "outline" {
	const variants: Record<
		TranscriptionProgress["status"],
		"default" | "secondary" | "destructive" | "outline"
	> = {
		idle: "outline",
		"loading-model": "secondary",
		transcribing: "default",
		complete: "default",
		error: "destructive",
	};
	return variants[status];
}

function formatRecordingDuration({ seconds }: { seconds: number }): string {
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function TranscriptionPlayground() {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const mediaRecorderRef = useRef<MediaRecorder | null>(null);
	const recordedChunksRef = useRef<Blob[]>([]);
	const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [modelId, setModelId] = useState<TranscriptionModelId>(
		DEFAULT_TRANSCRIPTION_MODEL,
	);
	const [language, setLanguage] = useState<TranscriptionLanguage>("auto");
	const [wordsPerChunk, setWordsPerChunk] = useState(DEFAULT_WORDS_PER_CAPTION);

	const [progress, setProgress] = useState<TranscriptionProgress>({
		status: "idle",
		progress: 0,
	});
	const [result, setResult] = useState<TranscriptionResult | null>(null);
	const [captionChunks, setCaptionChunks] = useState<CaptionChunk[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [elapsedMs, setElapsedMs] = useState<number | null>(null);

	const [isRecording, setIsRecording] = useState(false);
	const [isRequestingMic, setIsRequestingMic] = useState(false);
	const [recordingDuration, setRecordingDuration] = useState(0);
	const [micError, setMicError] = useState<string | null>(null);

	const audioUrl = useMemo(() => {
		if (!selectedFile) return null;
		return URL.createObjectURL(selectedFile);
	}, [selectedFile]);

	useEffect(() => {
		return () => {
			if (audioUrl) {
				URL.revokeObjectURL(audioUrl);
			}
		};
	}, [audioUrl]);

	useEffect(() => {
		return () => {
			if (mediaRecorderRef.current?.state === "recording") {
				mediaRecorderRef.current.stop();
			}
			if (recordingTimerRef.current) {
				clearInterval(recordingTimerRef.current);
			}
		};
	}, []);

	const clearResults = useCallback(() => {
		setResult(null);
		setCaptionChunks([]);
		setError(null);
		setElapsedMs(null);
		setProgress({ status: "idle", progress: 0 });
	}, []);

	const handleFileChange = useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) => {
			const file = event.target.files?.[0] ?? null;
			setSelectedFile(file);
			clearResults();
		},
		[clearResults],
	);

	const handleStartRecording = useCallback(async () => {
		if (!navigator.mediaDevices?.getUserMedia) {
			setMicError(
				"Microphone API not available. Ensure you are using HTTPS or localhost.",
			);
			return;
		}

		setMicError(null);
		setIsRequestingMic(true);

		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: true,
			});

			setIsRequestingMic(false);
			recordedChunksRef.current = [];
			setRecordingDuration(0);

			const mediaRecorder = new MediaRecorder(stream);
			mediaRecorderRef.current = mediaRecorder;

			mediaRecorder.ondataavailable = (event) => {
				if (event.data.size > 0) {
					recordedChunksRef.current.push(event.data);
				}
			};

			mediaRecorder.onstop = () => {
				for (const track of stream.getTracks()) {
					track.stop();
				}
				if (recordingTimerRef.current) {
					clearInterval(recordingTimerRef.current);
					recordingTimerRef.current = null;
				}

				const blob = new Blob(recordedChunksRef.current, {
					type: "audio/webm",
				});
				const file = new File([blob], "recording.webm", {
					type: "audio/webm",
				});
				setSelectedFile(file);
				clearResults();
				setIsRecording(false);
			};

			mediaRecorder.start(100);
			setIsRecording(true);

			const startedAt = Date.now();
			recordingTimerRef.current = setInterval(() => {
				setRecordingDuration(Math.floor((Date.now() - startedAt) / 1000));
			}, 500);
		} catch (caughtError) {
			setIsRequestingMic(false);
			const rawMessage =
				caughtError instanceof Error
					? caughtError.message
					: "Failed to access microphone";

			const isPermissionDenied =
				rawMessage.includes("Permission denied") ||
				rawMessage.includes("NotAllowedError") ||
				(caughtError instanceof DOMException &&
					caughtError.name === "NotAllowedError");

			const message = isPermissionDenied
				? "Microphone permission denied. Click the lock/site-settings icon in the address bar, allow microphone access, then reload the page."
				: rawMessage;

			setMicError(message);
		}
	}, [clearResults]);

	const handleStopRecording = useCallback(() => {
		if (mediaRecorderRef.current?.state === "recording") {
			mediaRecorderRef.current.stop();
		}
	}, []);

	const handleTranscribe = useCallback(async () => {
		if (!selectedFile) return;

		setError(null);
		setResult(null);
		setCaptionChunks([]);
		setElapsedMs(null);

		const startTime = performance.now();

		try {
			setProgress({ status: "loading-model", progress: 0 });

			const blob = new Blob([selectedFile], { type: selectedFile.type });
			const { samples, sampleRate } = await decodeAudioToFloat32({
				audioBlob: blob,
			});

			const transcriptionResult = await transcriptionService.transcribe({
				audioData: samples,
				sampleRate,
				language,
				modelId,
				onProgress: setProgress,
			});

			const elapsed = performance.now() - startTime;
			setElapsedMs(elapsed);
			setResult(transcriptionResult);
			setProgress({ status: "complete", progress: 100 });

			const chunks = buildCaptionChunks({
				segments: transcriptionResult.segments,
				wordsPerChunk,
			});
			setCaptionChunks(chunks);
		} catch (caughtError) {
			const elapsed = performance.now() - startTime;
			setElapsedMs(elapsed);
			const message =
				caughtError instanceof Error
					? caughtError.message
					: "Unknown error occurred";
			setError(message);
			setProgress({ status: "error", progress: 0 });
		}
	}, [selectedFile, modelId, language, wordsPerChunk]);

	const handleCancel = useCallback(() => {
		transcriptionService.cancel();
	}, []);

	const handleRegenerateCaptions = useCallback(() => {
		if (!result) return;
		const chunks = buildCaptionChunks({
			segments: result.segments,
			wordsPerChunk,
		});
		setCaptionChunks(chunks);
	}, [result, wordsPerChunk]);

	const isProcessing =
		progress.status === "loading-model" || progress.status === "transcribing";

	return (
		<div className="flex flex-col gap-6">
			<Card>
				<CardHeader>
					<CardTitle>Transcription Debugger</CardTitle>
					<CardDescription>
						Upload an audio/video file, configure the model, and inspect
						transcription results with full segment detail.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
						<div className="flex flex-col gap-2">
							<Label htmlFor="audio-file">Audio / Video File</Label>
							<Input
								id="audio-file"
								ref={fileInputRef}
								type="file"
								accept="audio/*,video/*"
								onChange={handleFileChange}
								disabled={isProcessing || isRecording}
							/>
							<div className="flex flex-col gap-1.5">
								<div className="flex items-center gap-2">
									{isRecording ? (
										<Button
											type="button"
											variant="destructive"
											size="sm"
											onClick={handleStopRecording}
										>
											<span className="mr-1.5 inline-block size-2 animate-pulse rounded-full bg-white" />
											Stop{" "}
											{formatRecordingDuration({
												seconds: recordingDuration,
											})}
										</Button>
									) : (
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={handleStartRecording}
											disabled={isProcessing || isRequestingMic}
										>
											{isRequestingMic ? "Requesting mic..." : "Record Mic"}
										</Button>
									)}
								</div>
								{micError && (
									<p className="text-destructive text-xs">{micError}</p>
								)}
							</div>
							{selectedFile && !isRecording && (
								<>
									<p className="text-muted-foreground text-xs">
										{selectedFile.name} (
										{(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
									</p>
									{audioUrl && (
										<audio controls src={audioUrl} className="mt-1 h-8 w-full">
											<track kind="captions" />
										</audio>
									)}
								</>
							)}
						</div>

						<div className="flex flex-col gap-2">
							<Label>Model</Label>
							<Select
								value={modelId}
								onValueChange={(value) =>
									setModelId(value as TranscriptionModelId)
								}
								disabled={isProcessing}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{TRANSCRIPTION_MODELS.map((model) => (
										<SelectItem key={model.id} value={model.id}>
											{model.name} — {model.description}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="flex flex-col gap-2">
							<Label>Language</Label>
							<Select
								value={language}
								onValueChange={(value) =>
									setLanguage(value as TranscriptionLanguage)
								}
								disabled={isProcessing}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="auto">Auto Detect</SelectItem>
									{TRANSCRIPTION_LANGUAGES.map((lang) => (
										<SelectItem key={lang.code} value={lang.code}>
											{lang.name} ({lang.code})
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="flex flex-col gap-2">
							<Label htmlFor="words-per-chunk">Words per Caption</Label>
							<Input
								id="words-per-chunk"
								type="number"
								min={1}
								max={20}
								value={wordsPerChunk}
								onChange={(event) =>
									setWordsPerChunk(
										Math.max(1, Number.parseInt(event.target.value, 10) || 1),
									)
								}
								disabled={isProcessing}
							/>
						</div>
					</div>

					<div className="mt-4 flex items-center gap-3">
						<Button
							type="button"
							onClick={handleTranscribe}
							disabled={!selectedFile || isProcessing || isRecording}
						>
							{isProcessing ? "Transcribing..." : "Start Transcription"}
						</Button>

						{isProcessing && (
							<Button type="button" variant="outline" onClick={handleCancel}>
								Cancel
							</Button>
						)}
					</div>
				</CardContent>
			</Card>

			{progress.status !== "idle" && (
				<Card>
					<CardContent className="pt-6">
						<div className="flex flex-col gap-3">
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-2">
									<Badge
										variant={getStatusVariant({ status: progress.status })}
									>
										{getStatusLabel({ status: progress.status })}
									</Badge>
									{progress.message && (
										<span className="text-muted-foreground text-sm">
											{progress.message}
										</span>
									)}
								</div>
								{elapsedMs !== null && (
									<span className="text-muted-foreground text-sm">
										{(elapsedMs / 1000).toFixed(2)}s
									</span>
								)}
							</div>
							<Progress value={progress.progress} />
						</div>
					</CardContent>
				</Card>
			)}

			{error && (
				<Card className="border-destructive">
					<CardContent className="pt-6">
						<p className="text-destructive text-sm">{error}</p>
					</CardContent>
				</Card>
			)}

			{result && (
				<Card>
					<CardHeader>
						<CardTitle>Results</CardTitle>
						<CardDescription>
							{result.segments.length} segments — Language: {result.language}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Tabs defaultValue="raw">
							<TabsList>
								<TabsTrigger value="raw">Raw Result</TabsTrigger>
								<TabsTrigger value="segments">
									Segments ({result.segments.length})
								</TabsTrigger>
								<TabsTrigger value="captions">
									Caption Chunks ({captionChunks.length})
								</TabsTrigger>
							</TabsList>

							<TabsContent value="raw" className="mt-4">
								<div className="flex flex-col gap-4">
									<div className="flex items-center gap-2">
										<Badge variant="outline">Language: {result.language}</Badge>
										<Badge variant="outline">
											Segments: {result.segments.length}
										</Badge>
									</div>

									<div className="bg-muted rounded-md p-4">
										<pre className="whitespace-pre-wrap text-sm">
											{result.text || "(empty)"}
										</pre>
									</div>
								</div>
							</TabsContent>

							<TabsContent value="segments" className="mt-4">
								<div className="max-h-[500px] overflow-auto">
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead className="w-12">#</TableHead>
												<TableHead className="w-36">Start</TableHead>
												<TableHead className="w-36">End</TableHead>
												<TableHead className="w-28">Duration</TableHead>
												<TableHead>Text</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{result.segments.map((segment, index) => (
												<TableRow key={`${segment.start}-${segment.end}`}>
													<TableCell className="text-muted-foreground font-mono text-xs">
														{index + 1}
													</TableCell>
													<TableCell className="font-mono text-xs">
														{formatTimestamp({ seconds: segment.start })}
													</TableCell>
													<TableCell className="font-mono text-xs">
														{formatTimestamp({ seconds: segment.end })}
													</TableCell>
													<TableCell className="text-muted-foreground font-mono text-xs">
														{(segment.end - segment.start).toFixed(3)}s
													</TableCell>
													<TableCell>{segment.text}</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								</div>
							</TabsContent>

							<TabsContent value="captions" className="mt-4">
								<div className="flex flex-col gap-4">
									<div className="flex items-center gap-3">
										<Label htmlFor="caption-words-per-chunk">
											Words per Chunk
										</Label>
										<Input
											id="caption-words-per-chunk"
											type="number"
											className="w-24"
											min={1}
											max={20}
											value={wordsPerChunk}
											onChange={(event) =>
												setWordsPerChunk(
													Math.max(
														1,
														Number.parseInt(event.target.value, 10) || 1,
													),
												)
											}
										/>
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={handleRegenerateCaptions}
										>
											Regenerate
										</Button>
									</div>

									<div className="max-h-[500px] overflow-auto">
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead className="w-12">#</TableHead>
													<TableHead className="w-36">Start</TableHead>
													<TableHead className="w-28">Duration</TableHead>
													<TableHead className="w-36">End</TableHead>
													<TableHead>Text</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{captionChunks.map((chunk, index) => (
													<TableRow
														key={`${chunk.startTime}-${chunk.duration}`}
													>
														<TableCell className="text-muted-foreground font-mono text-xs">
															{index + 1}
														</TableCell>
														<TableCell className="font-mono text-xs">
															{formatTimestamp({ seconds: chunk.startTime })}
														</TableCell>
														<TableCell className="text-muted-foreground font-mono text-xs">
															{chunk.duration.toFixed(3)}s
														</TableCell>
														<TableCell className="font-mono text-xs">
															{formatTimestamp({
																seconds: chunk.startTime + chunk.duration,
															})}
														</TableCell>
														<TableCell>{chunk.text}</TableCell>
													</TableRow>
												))}
											</TableBody>
										</Table>
									</div>
								</div>
							</TabsContent>
						</Tabs>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
