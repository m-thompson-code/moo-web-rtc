import { Injectable, NgZone, Renderer2 } from '@angular/core';
import { environment } from '@environment';

@Injectable({
    providedIn: 'root'
})
export class VideoService {
    public videosToHandle: HTMLVideoElement[] = [];

    public playRequiredInteraction: boolean = true;// TODO: ?

    private renderer?: Renderer2;

    private _clickFunc: () => void;
    private _detachListeners?: () => void;

    public playingVideos: {
        video: HTMLVideoElement;
        playingPromise: Promise<void>;
    }[] = [];

    constructor(private ngZone: NgZone) {
        this._clickFunc = () => {
            this.handleAllVideos();
        };
    }

    public init(renderer: Renderer2): void {
        this.renderer = renderer;
    }

    public detach(): void {
        this._detachListeners?.();
    }

    public pushPendingVideo(video: HTMLVideoElement): void {
        this.playRequiredInteraction = false;

        if (!this.videosToHandle.length) {
            if (!this.renderer) {
                throw new Error("Unexpected missing renderer. Call init");
            }
            
            const _off_click = this.renderer.listen('document', 'click', this._clickFunc);

            this._detachListeners = () => {
                _off_click();
            };
        }

        for (const _video of this.videosToHandle) {
            // Skip adding videos that are always in this array
            if (video === _video) {
                return;
            }
        }

        this.videosToHandle.push(video);
    }

    public handleAllVideos(): Promise<void> {
        const promises: Promise<any>[] = [];

        this.videosToHandle.forEach(video => {
            // console.log("video metadata", video.parentNode, video.src, video.srcObject);

            if (!video.parentNode) {
                console.warn("video no longer on dom, skipping", video.parentNode);
            } else if (!video.src && !video.srcObject) {
                console.warn("video has no src/srcObject, skipping");
            } else {
                // const muted = video.dataset.muted || video.getAttribute('muted');
                const autoplay = video.dataset.autoplay;// || video.getAttribute('autoplay');
                const unmuteOnHandle = video.dataset.unmuteOnHandle;

                console.log('unmuting on handle', unmuteOnHandle);

                if (unmuteOnHandle) {
                    video.muted = false;
                    // debugger;
                }

                if (autoplay && this._videoIsNotPlaying(video)) {
                    promises.push(this.playVideo(video));
                }
            }
        });

        this.videosToHandle = [];

        this.playRequiredInteraction = true;

        this._detachListeners?.();

        return Promise.all(promises).then(() => {
            // pass
        });
    }

    public playVideo(video: HTMLVideoElement): Promise<void> {
        for (let i = 0; i < this.playingVideos.length; i++) {
            const _v = this.playingVideos[i];

            if (_v.video === video) {
                console.log("already pending playing video", _v);
                return _v.playingPromise;
            }
        }

        const now = Date.now();

        console.log('playVideo started', now);

        const playingPromise = this._playVideo(video).catch(error => {
            console.error(error);
        }).then(() => {
            console.log('playVideo resolved', now);

            for (let i = 0; i < this.playingVideos.length; i++) {
                const _v = this.playingVideos[i];
    
                if (_v.video === video) {
                    this.playingVideos.splice(i, 1);
                    break;
                }
            }

            console.log(this.playingVideos, video.paused);

            // debugger;
        });

        this.playingVideos.push({
            video: video,
            playingPromise: playingPromise,
        });

        console.log(this.playingVideos, video.paused);
        // debugger;

        return playingPromise;
    }

    public _playVideo(video: HTMLVideoElement, attempt: number = 0): Promise<void> {
        
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

                    return this._playVideo(video, attempt + 1);
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
                return this._playVideo(video, attempt + 1);
            });
        }
    }

    /*
on stream
video.service.ts:175 bindVideoStream
video.service.ts:85 playVideo
peerjs.service.ts:325 on stream
video.service.ts:175 bindVideoStream
video.service.ts:85 playVideo
video.service.ts:121 DOMException: The play() request was interrupted by a new load request. https://goo.gl/LdLk22

    */
    
    // source:  https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/srcObject#Supporting_fallback_to_the_src_property
    public bindVideoStream(video: HTMLVideoElement, stream: MediaStream): void {
        console.log('bindVideoStream', stream.id);

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

        const autoplay = video.dataset.autoplay;// || video.getAttribute('autoplay');

        const notPlaying = this._videoIsNotPlaying(video);

        console.log('binding -> autoplay', !!autoplay, !!notPlaying);

        if (autoplay && notPlaying) {
            this.playVideo(video);
        }
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

    public _videoIsNotPlaying(video: HTMLVideoElement): boolean {
        return !!video.paused;
    }
}
