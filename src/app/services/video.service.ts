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

    public playAllVideos(): Promise<void> {
        const promises: Promise<any>[] = [];

        this.videosToPlay.forEach(video => {
            // console.log("video metadata", video.parentNode, video.src, video.srcObject);

            if (!video.parentNode) {
                console.warn("video no longer on dom, skipping", video.parentNode);
            } else if (!video.src && !video.srcObject) {
                console.warn("video has no src/srcObject, skipping");
            } else {
                promises.push(this.playVideo(video));
            }
        });

        this.videosToPlay = [];

        this.handledRequiredInteraction = true;

        return Promise.all(promises).then(() => {
            // pass
        });
    }

    public playVideo(video: HTMLVideoElement, attempt: number = 0): Promise<void> {
        let RETRY_LIMIT = 5;

        // Turns out the retry logic messes up the MediaStream anyway, so requesting a fresh call right away is likely better
        // Assumption that we are only supporting browsers that support srcObject
        if (video.srcObject) {
            // This idea of setting RETRY_LIMIT to 0 works, at least for Desktop/Safari
            RETRY_LIMIT = 0;
        }

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
                    throw error;
                }

                console.error(error);

                return Promise.resolve((resolve: () => void) => {
                    setTimeout(() => {
                        resolve();
                    }, 1000 + 500 * attempt);
                }).then(() => {
                    console.warn("playVideo retry", attempt + 1);
                    return this.playVideo(video, attempt + 1);
                });
            });
        } catch(error) {
            if (attempt >= RETRY_LIMIT) {
                console.error(error);
                throw error;
            }

            console.error(error);

            return Promise.resolve((resolve: () => void) => {
                setTimeout(() => {
                    resolve();
                }, 300 + 500 * attempt);
            }).then(() => {
                console.warn("playVideo retry", attempt + 1);
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

        track.onended = () => {
            console.log('track onended');
        }

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
