import {mlLabStageContainer} from '~/public/controllers/game/gameSetup.js';
import {cvCollection} from '~/public/assets/text/cvCollection.js';
import {uv2px} from '~/public/controllers/common/utils.js';
import {eventEmitter} from '~/public/controllers/game/gameSetup.js';
import EVENTS from '~/public/controllers/constants/events.js';
import MLPerson from '~/public/components/pixi/ml/person';
import PeopleTalkManager from '~/public/components/interface/ml/people-talk-manager/people-talk-manager';
import {mlModule} from '~/public/controllers/machine-learning/mlModule.js';

export default class {
    constructor() {
        this.container = new PIXI.Container();
        this.numOfPeople = Math.floor(uv2px(0.85, 'w')/70) * 2;
        this.personCount = 0;
        this.peopleLine = [];
        this.personXoffset = 70;
        this.peopleTalkManager = new PeopleTalkManager({parent: this.container, stage: 'ml'});
        this._createPeople();
        eventEmitter.on(EVENTS.RESIZE, this._draw.bind(this));
    }

    addToPixi() {
        mlLabStageContainer.addChild(this.container);
        this._draw();
        this.container.x = uv2px(0.25, 'w');
    }

    _draw() {
        this.container.y = uv2px(0.96, 'h');
    }

    _createPeople() {
        for (let i = 0; i < this.numOfPeople; i++) {
            this._addNewPerson();
        }
    }

    _addNewPerson() {
        const person = new MLPerson({
            parent: this.container,
            x: this.personCount*this.personXoffset,
            personData: cvCollection.cvData[this.personCount],
            id: this.personCount,
        });
        person.addToPixi();
        this.peopleLine.push(person);
        this.personCount++;
    }

    createTween() {
        const tween = PIXI.tweenManager.createTween(this.container);
        tween.from({x: this.container.x}).to({x: this.container.x-this.personXoffset});
        tween.delay = 200;
        tween.time = 700;
        return tween;
    }

    recalibrateTween(tween) {
        tween.from({x: this.container.x}).to({x: this.container.x-this.personXoffset});
    }

    getFirstPerson() {
        return this.peopleLine.length > 0 ? this.peopleLine[0] : undefined;
    }

    getCount() {
        return this.peopleLine.length;
    }

    evaluateFirstPerson() {
        const status = mlModule.predict(this.peopleLine[0].personData) == 1 ? 'accepted' : 'rejected';
        eventEmitter.emit(EVENTS.DATASET_VIEW_NEW_CV, {
            status: status,
            data: this.peopleLine[0].getData(),
        });
        this.peopleLine[0].removeFromLine({decision: status});
        this.peopleLine = this.peopleLine.slice(1);
        this._addNewPerson();
        return status;
    }
}
