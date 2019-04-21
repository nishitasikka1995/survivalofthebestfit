import * as PIXI from 'pixi.js';
import $ from 'jquery';
import {officeStageContainer, eventEmitter} from '~/public/controllers/game/gameSetup.js';
import {bluePersonTexture, yellowPersonTexture} from '~/public/controllers/common/textures.js';
import {gameFSM} from '~/public/controllers/game/stateManager.js';
import {createPerson, animateThisCandidate} from '~/public/components/pixi/person.js';
import Floor from '~/public/components/pixi/ml/floor.js';
import {cvCollection} from '~/public/assets/text/cvCollection.js';
import {screenSizeDetector, uv2px, spacingUtils as space} from '~/public/controllers/common/utils.js';
import Door from '~/public/components/pixi/door.js';
import ResumeUI from '~/public/components/interface/ui-resume/ui-resume';
import InstructionUI from '~/public/components/interface/ui-instruction/ui-instruction';
import YesNo from '~/public/components/interface/yes-no/yes-no';
import PeopleTalkManager from '~/public/components/interface/ml/people-talk-manager/people-talk-manager';
import ANCHORS from '~/public/controllers/constants/pixi-anchors';
import EVENTS from '~/public/controllers/constants/events';
import SCALES from '~/public/controllers/constants/pixi-scales.js';
import PerfMetrics from '~/public/components/interface/perf-metrics/perf-metrics';
import TaskUI from '../../components/interface/ui-task/ui-task';
import TextBoxUI from '../../components/interface/ui-textbox/ui-textbox';

const spotlight = {
    x: uv2px(0.4, 'w'),
    y: uv2px(ANCHORS.FLOORS.FIRST_FLOOR.y - 0.13, 'h'),
};

const candidatePoolSize = {
    smallOfficeStage: 7,
    mediumOfficeStage: 10,
    largeOfficeStage: 15
}

class Office {
    constructor() {
        this.uniqueCandidateIndex = 0;
        this.currentStage = 0;
        this.scale = 1;
        this.deskList = [];
        this.floorList = [];
        this.takenDesks = 0;
        this.interiorContainer = new PIXI.Container();
        this.personContainer = new PIXI.Container();
        this.entryDoorX = 0.1;
        this.exitDoorX = 0.6;
        this.personStartX = 0.22;
        this.personStartY = 0.87;
        this.xOffset = 0.05;
        // IMPORTANT: people are stored by index so can't delete array
        this.allPeople = [];
        this.hiredPeople = [];        
        this.toReplaceX = 0;

        this.task;
        this.stageText;

        this.floors = {
            ground_floor: new Floor({type: 'ground_floor'}),
            first_floor: new Floor({type: 'first_floor'}),
        };

        this.instructions = new InstructionUI();

        this.peopleTalkManager = new PeopleTalkManager({parent: this.personContainer, stage: 'manual'});

        this.doors = [
            new Door({
                type: 'doorAccepted',
                floor: 'first_floor',
                floorParent: this.floors.first_floor,
                xAnchor: uv2px(this.entryDoorX, 'w'),
            }),
            new Door({
                type: 'doorRejected',
                floor: 'first_floor',
                floorParent: this.floors.first_floor,
                xAnchor: uv2px(this.exitDoorX, 'w'),
            }),
        ];
        this.listenerSetup();
    }

    draw(stageNum) {
        candidateInSpot = null;
        this.takenDesks = 0;
        this.currentStage = stageNum;

        let showTimer;

        if (stageNum == 0) {
            // SMALL STAGE - INITIAL SET UP

            showTimer = false;

            for (const floor in this.floors) {
                if (Object.prototype.hasOwnProperty.call(this.floors, floor)) {
                    this.floors[floor].addToPixi(this.interiorContainer);
                }
            };

            this.doors.forEach((door) => door.addToPixi(this.interiorContainer));
            this.yesno = new YesNo({show: true});
            this.instructions.reveal({type: 'manual-click'});

            if (this.personContainer.children.length > 0) {
                // in case small stage was repeated, clear the office
                officeStageContainer.removeChild(this.personContainer);
                this.personContainer = new PIXI.Container();
            }

            // Adding people for small stage
            this.addPeople(0, candidatePoolSize.smallOfficeStage);
            this.peopleTalkManager.startTimeline();
        }

        else {
            showTimer = true;
            // MEDIUM OFFICE STAGE - REDRAW PEOPLE
            officeStageContainer.removeChild(this.personContainer);
            this.personContainer = new PIXI.Container();

            // empty the people line

            let toAdd = stageNum === 1 ? candidatePoolSize.mediumOfficeStage : candidatePoolSize.largeOfficeStage;
            this.addPeople(this.uniqueCandidateIndex, toAdd);

            
        }

        officeStageContainer.addChild(this.interiorContainer);
        officeStageContainer.addChild(this.personContainer);

        this.task = new TaskUI({
            showTimer: showTimer, 
            hires: this.stageText.hiringGoal, 
            duration: this.stageText.duration, 
            content: this.stageText.taskDescription
        });
        
    }

    moveTweenHorizontally(tween, newX) {
        tween.stop().clear();
        tween.to({x: newX});
        tween.easing = PIXI.tween.Easing.inOutSine();
        tween.time = 1200;
        tween.start();
    }

    listenerSetup() {
        eventEmitter.on(EVENTS.DISPLAY_THIS_CV, () => {
            new ResumeUI({
                show: true,
                features: cvCollection.cvFeatures,
                scores: cvCollection.smallOfficeStage,
                candidateId: candidateClicked,
            });
        });

        eventEmitter.on(EVENTS.STAGE_INCOMPLETE, () => {
            this.task.reset();

            new TextBoxUI({
                isRetry: true,
                stageNumber: this.currentStage,
                content: this.stageText.retryMessage,
                responses: this.stageText.retryResponses,
                show: true,
                overlay: true,
            });
        });

        this.acceptedHandler = () => {
            this.takenDesks += 1;
            const hiredPerson = this.allPeople[candidateInSpot];
            this.hiredPeople.push(hiredPerson);
            this.toReplaceX = hiredPerson.uvX;
            this.placeCandidate(this.toReplaceX);

            this.moveTweenHorizontally(hiredPerson.tween, uv2px(this.entryDoorX + 0.04, 'w'));
            candidateInSpot = null;
            this.doors[0].playAnimation({direction: 'forward'});

            hiredPerson.tween.on('end', () => {
                this.personContainer.removeChild(hiredPerson);
                this.doors[0].playAnimation({direction: 'reverse'});
            });

            if (this.takenDesks == this.stageText.hiringGoal) {
                eventEmitter.emit(EVENTS.MANUAL_STAGE_COMPLETE, {stageNumber: this.currentStage});
                this.task.reset();
                gameFSM.nextStage();
            }
        };

        this.rejectedHandler = () => {
            const rejectedPerson = this.allPeople[candidateInSpot];
            this.toReplaceX = rejectedPerson.uvX;
            this.placeCandidate(this.toReplaceX);

            this.moveTweenHorizontally(rejectedPerson.tween, uv2px(this.exitDoorX + 0.04, 'w'));

            candidateInSpot = null;
            this.doors[1].playAnimation({direction: 'forward'});

            rejectedPerson.tween.on('end', () => {
                this.personContainer.removeChild(rejectedPerson);
                this.doors[1].playAnimation({direction: 'reverse'});
            });
        };

        eventEmitter.on(EVENTS.ACCEPTED, this.acceptedHandler);

        eventEmitter.on(EVENTS.REJECTED, this.rejectedHandler);

        eventEmitter.on(EVENTS.RETURN_CANDIDATE, () => {
            animateThisCandidate(this.allPeople[candidateInSpot], this.allPeople[candidateInSpot].originalX, this.allPeople[candidateInSpot].originalY);
            this.allPeople[candidateInSpot].inSpotlight = false;
        });

        eventEmitter.on(EVENTS.INSTRUCTION_ACKED, (data) => {
            this.start(data.stageNumber);
        });

        eventEmitter.on(EVENTS.RETRY_INSTRUCTION_ACKED, (data) => {
            this.start(data.stageNumber);
        });
    }

    start(stageNum) {
        if (this.task) {
            this.task.destroy();
            this.task = null;
        }

        switch(stageNum) {
            case 0:
                this.stageText = txt.smallOfficeStage;
                break;
            case 1:
                this.stageText = txt.mediumOfficeStage;
                break;
            case 2:
                this.stageText = txt.largeOfficeStage;
                break;
        }
        
        this.draw(stageNum);
    }

    placeCandidate(thisX) {
        let texture = bluePersonTexture;
        const color = cvCollection.smallOfficeStage[this.uniqueCandidateIndex].color;
        const name = cvCollection.smallOfficeStage[this.uniqueCandidateIndex].name;
        texture = (color === 'yellow') ? yellowPersonTexture : bluePersonTexture;
        const person = createPerson(thisX, this.personStartY, this.uniqueCandidateIndex, texture);
        this.personContainer.addChild(person);
        this.allPeople.push(person);
        this.uniqueCandidateIndex++;
    }

    addPeople(startIndex, count) {
        for (let i = startIndex; i < startIndex + count; i++) {
            const orderInLine = i - startIndex;
            this.placeCandidate(this.personStartX + this.xOffset * orderInLine);
        }
    }

    _removeEventListeners() {
        eventEmitter.off(EVENTS.ACCEPTED, this.acceptedHandler);
        eventEmitter.off(EVENTS.REJECTED, this.rejectedHandler);
        eventEmitter.off(EVENTS.RETURN_CANDIDATE, () => {});
        eventEmitter.off(EVENTS.STAGE_INCOMPLETE, () => {});
        eventEmitter.off(EVENTS.DISPLAY_THIS_CV, () => {});
        eventEmitter.off(EVENTS.RETRY_INSTRUCTION_ACKED, () => {});
        eventEmitter.off(EVENTS.INSTRUCTION_ACKED, () => {});
    }


    delete() {
        this.doors.forEach((door) => {
            door.destroy();
        });
        this.instructions.destroy();
        officeStageContainer.removeChild(this.interiorContainer);
        officeStageContainer.removeChild(this.personContainer);
        this._removeEventListeners();
        this.peopleTalkManager.destroy();
        $( '#js-task-timer' ).remove();
    }
}

export {Office, spotlight};
