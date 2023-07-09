export class Mutex {
    private _locked: boolean;
    private _queue: Array<(value: boolean) => void>;

    constructor() {
        this._locked = false;
        this._queue = [];
    }

    lock(): Promise<boolean> {
        return new Promise(resolve => {
            if (this._locked) {
                this._queue.push(resolve);
            } else {
                this._locked = true;
                resolve(true);
            }
        });
    }

    unlock(): void {
        if (this._queue.length > 0) {
            const resolve = this._queue.shift();
            if (resolve) {
                resolve(true);
            }
        } else {
            this._locked = false;
        }
    }
}
