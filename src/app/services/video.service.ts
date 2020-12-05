import { Injectable, NgZone } from '@angular/core';
import { environment } from '@environment';

@Injectable({
    providedIn: 'root'
})
export class VideoService {
    public videosToPlay: HTMLVideoElement[] = [];

    public handledRequiredInteraction: boolean = true;// TODO: ?

    constructor(private ngZone: NgZone) {

    }

    public pushPendingVideo(video: HTMLVideoElement): void {
        this.handledRequiredInteraction = false;

        this.videosToPlay.push(video);
    }

    public playAllVideos(): void {
        // const videos = document.querySelectorAll('video');

        this.videosToPlay.forEach(video => {
            this.playVideo(video);
        });

        this.videosToPlay = [];

        this.handledRequiredInteraction = true;
    }

    public playVideo(video: HTMLVideoElement, attempt: number = 0): Promise<void> {
        const RETRY_LIMIT = 5;

        try {
            // source: https://developers.google.com/web/updates/2017/06/play-request-was-interrupted
            // ie11 doesn't treat HTMLVideoElement.play as a promise
            const playFunc = video.play();

            let playPromise: Promise<void> | undefined;

            if (!playFunc || !playFunc.then) {
                playPromise = Promise.resolve();
            } else {
                playPromise = playFunc;
            }

            return playPromise.catch(error => {
                if (attempt >= RETRY_LIMIT) {
                    console.error(error);
                    return;
                }

                console.error(error);

                return Promise.resolve((resolve: () => void) => {
                    setTimeout(() => {
                        resolve();
                    }, 300 + 500 * attempt);
                }).then(() => {
                    return this.playVideo(video, attempt + 1);
                });
            });
        } catch(error) {
            if (attempt >= RETRY_LIMIT) {
                console.error(error);
                return Promise.resolve();
            }

            console.error(error);

            return Promise.resolve((resolve: () => void) => {
                setTimeout(() => {
                    resolve();
                }, 300 + 500 * attempt);
            }).then(() => {
                return this.playVideo(video, attempt + 1);
            });
        }
    }
    
    // source:  https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/srcObject#Supporting_fallback_to_the_src_property
    public bindVideoStream(video: HTMLVideoElement, stream: MediaStream): void {
        // const mediaSource = new MediaSource();
        // const video = document.createElement('video');

        // Older browsers may not have srcObject
        const clientSupportsMediaStreams = 'srcObject' in video;
        
        if (clientSupportsMediaStreams) {
            try {
                video.srcObject = stream;
            } catch (err) {
                if (err.name != "TypeError") {
                    throw err;
                }
                // Even if they do, they may only support MediaStream
                video.src = URL.createObjectURL(stream);
            }
        } else {
            video.src = URL.createObjectURL(stream);
        }

        const [track] = stream.getVideoTracks();
        track.addEventListener('ended', () => {
            this.ngZone.run(() => {
                console.log('track ended', video, stream);
            });
        });

        track.onended = () => console.log('track onended');

        this.pushPendingVideo(video);
    }

    public removeVideoStream(mediaStream: MediaStream, video?: HTMLVideoElement): void {
        const tracks = mediaStream.getTracks();

        tracks.forEach(track => track.stop());
        // for good measure? See
        // https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/stop#Stopping_a_video_stream
        if (video) {
            if (video.srcObject) {
                video.srcObject = null;
            }

            if (video.src) {
                video.src = "";
            }
        }
    }
}
