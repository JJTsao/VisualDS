import { makeSortingUI, createSortingRenderer } from './render-array.js';
export const chapterUI   = makeSortingUI('selection');
export const createRenderer = (inst, stage, opts) => createSortingRenderer(inst, stage, opts);
