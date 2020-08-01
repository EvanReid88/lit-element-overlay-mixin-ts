import { LitElement } from "lit-element";

export type Constructor<T> = new(...args: any[]) => T;

export abstract class OverlayClass extends LitElement {
    alwaysOpen: boolean;
    opened: boolean
    
    show?(): void;
    hide?(): void;
    overlayToIgnore?(...elementIds: string[]): void;
}

/**
 * Returns a LitElement class extending the base that implements handling of simple overlay functionality, such as closing when an outside element 
 * is clicked or Esc is pressed. 
 *
 * Elements call show() and hide() to use. 
 * @param base 
 */
export const OverlayMixin = <T extends Constructor<LitElement>>(base: T): T & Constructor<OverlayClass> => {
    return class MxOverlay extends base {

        /**
         * Determines if the overlay closes on outside clicks
         */
        alwaysOpen: boolean = false;

        /**
         * Flag for checking if overlay is opened
         */
        opened: boolean = false;

        /**
         * List of element ids which prevent overlay hide
         * if the id exists in click event path
         */
        private _overlayToIgnore: Set<string> = new Set();

        /**
         * Flag which represent if the last hold event was fired inside the overlay element
         */
        private _holdEventInside: boolean = false;

        private _preventCloseOnOutsideEvent: any;
        private _onCaptureOverlayClickEvent: any;
        private _onCaptureOverlayHoldEvent: any;
        private _onCaptureOverlayScrollEvent: any;
        private _escKeyHandler: any;

        /**
         * List of events handled by overlay mixin representing a completed click/tap
         */
        private _overlayClickEvents: string[];

        /**
         * List of events which represent user click and hold.
         * used to determine if the starting location of a click-and-drag / tap-and-drag
         * is inside the overlay element
         */
        private _overlayHoldEvents: string[];

        /**
         * List of scroll-related events handled by overlay mixin
         */
        private _overlayScrollEvents: string[];

        private _overlayMinZIndex: number = 1000; 
        private _initialZIndex: string;
        private _handleFeaturesTimeoutMs: number = 10;
        private _listenersAttached: boolean = false;

        constructor(...any) {
            super(...any);

            this._overlayClickEvents = [
                'mouseup',
                'touchend'
            ];

            this._overlayHoldEvents = [
                'mousedown',
                'touchstart'
            ];

            this._overlayScrollEvents = [
                'scroll'
            ]
        }

        /**
         * @event mx-overlay-before-show right before the overlay shows
         * @event mx-overlay-show right after the overlay is shown
         */
        show(): void {
            const event = new CustomEvent('mx-overlay-before-shown', { cancelable: true });
            this.dispatchEvent(event);
            if (!event.defaultPrevented) {
                this.showItem();
                this.handleFeatures(!this.alwaysOpen);
                this.dispatchEvent(new CustomEvent('mx-overlay-shown', { bubbles: true, composed: true}));
            }
        }

        /**
         * @event mx-overlay-before-hide right before the overlay hides
         * @event mx-overlay-hide right after the overlay is hidden
         */
        hide(): void {     
            const event = new CustomEvent('overlay-before-hidden', { cancelable: true });
            this.dispatchEvent(event);
            if (!event.defaultPrevented) {
                this.hideItem();
                this.handleFeatures(false);
                this.dispatchEvent(new CustomEvent('overlay-hidden', { bubbles: true, composed: true }));
            }
        }

        overlayToIgnore(...elementIds: string[]): void {
            elementIds.forEach(id => {
                if (id) {
                    this._overlayToIgnore.add(id);
                }
            });
        }
        
        /**
         * show overlay element
         */
        protected showItem(): void {
            this.hidden = false;
            this.opened = true;
        }

        /**
         * hide overlay element
         */
        protected hideItem(): void {
            this.hidden = true;
            this.opened = false;
        }

        /**
         * @desc All features are handled here. Every feature is set up on show
         * and torn down otherwise
         * @param show Indicates whether this is part of showing phase to set up the features. If false, will behave to remove the functionality
         */
        private handleFeatures(show: boolean): void {
            this.handleZIndex(show);

            // timeout to prevent overlay launching clicks from being registered
            setTimeout(() => {
                this.handleHidesOnOutsideEsc(show);
                this.handleHidesOnOutsideClick(show);
            }, this._handleFeaturesTimeoutMs);
        }

        /**
         * @desc When showing overlay, sets overlays to minimum z-index if needed to display on top of other elements. 
         * Resets z-index to original on closing.
         */
        private handleZIndex(show: boolean): void {
            if (show) {
                this._initialZIndex = this.style.zIndex;
                if (Number(this._initialZIndex) < this._overlayMinZIndex) {
                    this.style.zIndex = this._overlayMinZIndex.toString();
                }
            } else {
                this.style.zIndex = this._initialZIndex;
            }
        }

        /**
         * add listeners for outside click events
         * @param show whether the overlay is shown
         */
        private handleHidesOnOutsideClick(show: boolean): void {
            if (show) {
                if (this._listenersAttached) {
                    // skip assigning listeners if already opened
                    return;
                }

                let wasClickInside = false;

                this._preventCloseOnOutsideEvent= () => {
                    wasClickInside = true;
                    setTimeout(() => {
                        wasClickInside = false;
                    });
                };

                // handle click capture phase and schedule the hide if _holdEventInside is true
                this._onCaptureOverlayClickEvent = (e: Event) => {
                    setTimeout(() => {
                        if (!this._holdEventInside) {
                            this.hide();
                        }
                    });
                };

                // handle hold phase and update _holdEventInside value
                this._onCaptureOverlayHoldEvent = (e: Event) => {
                    setTimeout(() => {
                        this._holdEventInside = wasClickInside === true || this.isElementAllowed(this, e)
                    });
                };

                // handle scroll capture phase and schedule the hide if needed
                this._onCaptureOverlayScrollEvent = (e: Event) => {
                    setTimeout(() => {
                        if (wasClickInside === false && !this.isElementAllowed(this, e)) {
                            this.hide();
                        }
                    });
                }
            }

            this.handleOverlayListeners(show);
        }

        private handleOverlayListeners(show: boolean): void {
            const addOrRemoveListener = show ? 'addEventListener' : 'removeEventListener';

            // add/remove listeners for events which trigger overlay hide (mouseup, touchend)
            this.updateClickEventListeners(addOrRemoveListener);

            // add/remove listeners for hold events (mousedown, touchstart)
            this.updateHoldEventListeners(addOrRemoveListener);

            // add/remove listeners for scroll events which trigger overlay hide
            this.updateScrollEventListeners(addOrRemoveListener);

            this._listenersAttached = show;
        }

        private updateClickEventListeners(addOrRemoveListener: string): void {
            this._overlayClickEvents.forEach((eventName) => {
                document.documentElement[addOrRemoveListener](eventName, this._onCaptureOverlayClickEvent, true);
            });
        }

        private updateHoldEventListeners(addOrRemoveListener: string): void {
            this._overlayHoldEvents.forEach((eventName) => {
                this[addOrRemoveListener](eventName, this._preventCloseOnOutsideEvent, true);

                document.documentElement[addOrRemoveListener](eventName, this._onCaptureOverlayHoldEvent, true);
            });
        }

        private updateScrollEventListeners(addOrRemoveListener: string): void {
            this._overlayScrollEvents.forEach((eventName) => {
                this[addOrRemoveListener](eventName, this._preventCloseOnOutsideEvent, true);

                document.documentElement[addOrRemoveListener](eventName, this._onCaptureOverlayScrollEvent, true);
            });
        }


        /**
         * add listeners for escape key press
         * @param show whether the overlay is shown
         */
        private handleHidesOnOutsideEsc(show: boolean): void {
            if (show) {
                this._escKeyHandler = ev => ev.key === 'Escape' && this.hide();
                document.addEventListener('keyup', this._escKeyHandler);
            } else  {
                document.removeEventListener('keyup', this._escKeyHandler);
            }
        }

        /**
         * Method which checks if click event path contains elements in 
         * _overlayToIgnore, and prevents overlay hide if id exists in event path
         * isElementContained is called to check if event target is nested in overlay parent
         * @param parent the parentNode of the overlay
         * @param event overlay click event
         */
        private isElementAllowed(parent: Node & ParentNode, event: any): boolean {
            if (this._overlayToIgnore?.size > 0) {
                for (const element of event.path) {
                    if (element.id && this._overlayToIgnore.has(element.id)) {
                        return true;
                    }
                }
            }
            
            return this.isElementContained(parent, event);
        }

       /**
        * Method which checks if the click event target is nested in overlay parent
        * @param parent the parentNode of the overlay
        * @param event overlay click event
        */
        private isElementContained(parent: Node & ParentNode, event: any) : boolean{
            var node = event.target?.parentNode;
            while (node != null) {
                if (node === parent) {
                    return true;
                }
                node = node.parentNode;
            }
            return false;
        }

        disconnectedCallback(): void {
            super.disconnectedCallback();

            this.handleFeatures(false);
        }
    }
}
