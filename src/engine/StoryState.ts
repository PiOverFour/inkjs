import { CallStack } from "./CallStack";
import { VariablesState } from "./VariablesState";
import { ValueType, Value, StringValue, ListValue } from "./Value";
import { PushPopType } from "./PushPop";
import { Tag } from "./Tag";
import { Glue } from "./Glue";
import { Path } from "./Path";
import { ControlCommand } from "./ControlCommand";
import { StoryException } from "./StoryException";
import { StringBuilder } from "./StringBuilder";
import { JsonSerialisation } from "./JsonSerialisation";
import { PRNG } from "./PRNG";
import { Void } from "./Void";
import { Pointer } from "./Pointer";
import { tryGetValueFromMap } from "./TryGetResult";
import { Choice } from "./Choice";
import { asOrNull, asOrThrows, nullIfUndefined } from "./TypeAssertion";
import { Debug } from "./Debug";
import { Container } from "./Container";
import { InkObject } from "./Object";
import { throwNullException } from "./NullException";
import { Story } from "./Story";
import { StatePatch } from "./StatePatch";
import { SimpleJson } from "./SimpleJson";

export class StoryState {
  public readonly kInkSaveStateVersion = 8;
  public readonly kMinCompatibleLoadVersion = 8;

  public ToJson(indented: boolean = false) {
    let writer = new SimpleJson.Writer();
    this.WriteJson(writer);
    return writer.ToString();
  }
  public toJson(indented: boolean = false) {
    return this.ToJson(indented);
  }

  public LoadJson(json: string) {
    let jObject = SimpleJson.TextToDictionary(json);
    this.LoadJsonObj(jObject);
  }

  public VisitCountAtPathString(pathString: string) {
    let visitCountOut;

    if (this._patch !== null) {
      let container = this.story.ContentAtPath(new Path(pathString)).container;
      if (container === null)
        throw new Error("Content at path not found: " + pathString);

      visitCountOut = this._patch.TryGetVisitCount(container, 0);
      if (visitCountOut.exists) return visitCountOut.result;
    }

    visitCountOut = tryGetValueFromMap(this._visitCounts, pathString, null);
    if (visitCountOut.exists) return visitCountOut.result;

    return 0;
  }

  public VisitCountForContainer(container: Container | null): number {
    if (container === null) {
      return throwNullException("container");
    }
    if (!container.visitsShouldBeCounted) {
      this.story.Error(
        "Read count for target (" +
          container.name +
          " - on " +
          container.debugMetadata +
          ") unknown. The story may need to be compiled with countAllVisits flag (-c)."
      );
      return 0;
    }

    if (this._patch !== null) {
      let count = this._patch.TryGetVisitCount(container, 0);
      if (count.exists) {
        return count.result!;
      }
    }

    let containerPathStr = container.path.toString();
    let count2 = tryGetValueFromMap(this._visitCounts, containerPathStr, null);
    if (count2.exists) {
      return count2.result!;
    }

    return 0;
  }

  public IncrementVisitCountForContainer(container: Container) {
    if (this._patch !== null) {
      let currCount = this.VisitCountForContainer(container);
      currCount++;
      this._patch.SetVisitCount(container, currCount);
      return;
    }

    let containerPathStr = container.path.toString();
    let count = tryGetValueFromMap(this._visitCounts, containerPathStr, null);
    if (count.exists) {
      this._visitCounts.set(containerPathStr, count.result! + 1);
    } else {
      this._visitCounts.set(containerPathStr, 1);
    }
  }

  public RecordTurnIndexVisitToContainer(container: Container) {
    if (this._patch !== null) {
      this._patch.SetTurnIndex(container, this.currentTurnIndex);
      return;
    }

    let containerPathStr = container.path.toString();
    this._turnIndices.set(containerPathStr, this.currentTurnIndex);
  }

  public TurnsSinceForContainer(container: Container) {
    if (!container.turnIndexShouldBeCounted) {
      this.story.Error(
        "TURNS_SINCE() for target (" +
          container.name +
          " - on " +
          container.debugMetadata +
          ") unknown. The story may need to be compiled with countAllVisits flag (-c)."
      );
    }

    if (this._patch !== null) {
      let index = this._patch.TryGetTurnIndex(container, 0);
      if (index.exists) {
        return this.currentTurnIndex - index.result!;
      }
    }

    let containerPathStr = container.path.toString();
    let index2 = tryGetValueFromMap(this._turnIndices, containerPathStr, 0);
    if (index2.exists) {
      return this.currentTurnIndex - index2.result!;
    } else {
      return -1;
    }
  }

  get callstackDepth() {
    return this.callStack.depth;
  }

  get outputStream() {
    return this._outputStream;
  }

  get currentChoices() {
    // If we can continue generating text content rather than choices,
    // then we reflect the choice list as being empty, since choices
    // should always come at the end.
    if (this.canContinue) return [];
    return this._currentChoices;
  }

  get generatedChoices() {
    return this._currentChoices;
  }

  get currentErrors() {
    return this._currentErrors;
  }
  private _currentErrors: string[] | null = null;

  get currentWarnings() {
    return this._currentWarnings;
  }
  private _currentWarnings: string[] | null = null;

  get variablesState() {
    return this._variablesState;
  }
  set variablesState(value) {
    this._variablesState = value;
  }
  private _variablesState: VariablesState;

  public callStack: CallStack;

  get evaluationStack() {
    return this._evaluationStack;
  }
  private _evaluationStack: InkObject[];

  public divertedPointer: Pointer = Pointer.Null;

  get visitCounts() {
    return this._visitCounts;
  }

  get turnIndices() {
    return this._turnIndices;
  }

  get currentTurnIndex() {
    return this._currentTurnIndex;
  }
  set currentTurnIndex(value) {
    this._currentTurnIndex = value;
  }
  private _currentTurnIndex: number = 0;

  public storySeed: number = 0;
  public previousRandom: number = 0;
  public didSafeExit: boolean = false;

  public story: Story;

  get currentPathString() {
    let pointer = this.currentPointer;
    if (pointer.isNull) {
      return null;
    } else {
      if (pointer.path === null) {
        return throwNullException("pointer.path");
      }
      return pointer.path.toString();
    }
  }

  get currentPointer() {
    return this.callStack.currentElement.currentPointer.copy();
  }

  set currentPointer(value) {
    this.callStack.currentElement.currentPointer = value.copy();
  }

  get previousPointer() {
    return this.callStack.currentThread.previousPointer.copy();
  }

  set previousPointer(value) {
    this.callStack.currentThread.previousPointer = value.copy();
  }

  get canContinue() {
    return !this.currentPointer.isNull && !this.hasError;
  }

  get hasError() {
    return this.currentErrors != null && this.currentErrors.length > 0;
  }

  get hasWarning() {
    return this.currentWarnings != null && this.currentWarnings.length > 0;
  }

  get currentText() {
    if (this._outputStreamTextDirty) {
      let sb = new StringBuilder();

      for (let outputObj of this._outputStream) {
        // var textContent = outputObj as StringValue;
        let textContent = asOrNull(outputObj, StringValue);
        if (textContent !== null) {
          sb.Append(textContent.value);
        }
      }

      this._currentText = this.CleanOutputWhitespace(sb.toString());
      this._outputStreamTextDirty = false;
    }

    return this._currentText;
  }
  private _currentText: string | null = null;

  public CleanOutputWhitespace(str: string) {
    let sb = new StringBuilder();

    let currentWhitespaceStart = -1;
    let startOfLine = 0;

    for (let i = 0; i < str.length; i++) {
      let c = str.charAt(i);

      let isInlineWhitespace = c == " " || c == "\t";

      if (isInlineWhitespace && currentWhitespaceStart == -1)
        currentWhitespaceStart = i;

      if (!isInlineWhitespace) {
        if (
          c != "\n" &&
          currentWhitespaceStart > 0 &&
          currentWhitespaceStart != startOfLine
        ) {
          sb.Append(" ");
        }
        currentWhitespaceStart = -1;
      }

      if (c == "\n") startOfLine = i + 1;

      if (!isInlineWhitespace) sb.Append(c);
    }

    return sb.toString();
  }

  get currentTags() {
    if (this._outputStreamTagsDirty) {
      this._currentTags = [];

      for (let outputObj of this._outputStream) {
        // var tag = outputObj as Tag;
        let tag = asOrNull(outputObj, Tag);
        if (tag !== null) {
          this._currentTags.push(tag.text);
        }
      }

      this._outputStreamTagsDirty = false;
    }

    return this._currentTags;
  }
  private _currentTags: string[] | null = null;

  get inExpressionEvaluation() {
    return this.callStack.currentElement.inExpressionEvaluation;
  }
  set inExpressionEvaluation(value) {
    this.callStack.currentElement.inExpressionEvaluation = value;
  }

  constructor(story: Story) {
    this.story = story;

    this._outputStream = [];
    this.OutputStreamDirty();

    this._evaluationStack = [];

    this.callStack = new CallStack(story);
    this._variablesState = new VariablesState(
      this.callStack,
      story.listDefinitions
    );

    this._visitCounts = new Map();
    this._turnIndices = new Map();
    this.currentTurnIndex = -1;

    let timeSeed = new Date().getTime();
    this.storySeed = new PRNG(timeSeed).next() % 100;
    this.previousRandom = 0;

    this._currentChoices = [];

    this.GoToStart();
  }

  public GoToStart() {
    this.callStack.currentElement.currentPointer = Pointer.StartOf(
      this.story.mainContentContainer
    );
  }

  public CopyAndStartPatching() {
    let copy = new StoryState(this.story);

    copy._patch = new StatePatch(this._patch);

    copy.outputStream.push(...this._outputStream);
    copy.OutputStreamDirty();

    copy._currentChoices.push(...this._currentChoices);

    if (this.hasError) {
      copy._currentErrors = [];
      copy._currentErrors.push(...(this.currentErrors || []));
    }

    if (this.hasWarning) {
      copy._currentWarnings = [];
      copy._currentWarnings.push(...(this.currentWarnings || []));
    }

    copy.callStack = new CallStack(this.callStack);

    copy.variablesState = this.variablesState;
    copy.variablesState.callStack = copy.callStack;
    copy.variablesState.patch = copy._patch;

    copy.evaluationStack.push(...this.evaluationStack);

    if (!this.divertedPointer.isNull)
      copy.divertedPointer = this.divertedPointer.copy();

    copy.previousPointer = this.previousPointer.copy();

    copy._visitCounts = this._visitCounts;
    copy._turnIndices = this._turnIndices;

    copy.currentTurnIndex = this.currentTurnIndex;
    copy.storySeed = this.storySeed;
    copy.previousRandom = this.previousRandom;

    copy.didSafeExit = this.didSafeExit;

    return copy;
  }

  public RestoreAfterPatch() {
    this.variablesState.callStack = this.callStack;
    this.variablesState.patch = this._patch;
  }

  public ApplyAnyPatch() {
    if (this._patch === null) return;

    this.variablesState.ApplyPatch();

    for (let [key, value] of this._patch.visitCounts)
      this.ApplyCountChanges(key, value, true);

    for (let [key, value] of this._patch.turnIndices)
      this.ApplyCountChanges(key, value, false);

    this._patch = null;
  }

  public ApplyCountChanges(
    container: Container,
    newCount: number,
    isVisit: boolean
  ) {
    let counts = isVisit ? this._visitCounts : this._turnIndices;
    counts.set(container.path.toString(), newCount);
  }

  public WriteJson(writer: SimpleJson.Writer) {
    writer.WriteObjectStart();

    let hasChoiceThreads = false;
    for (let c of this._currentChoices) {
      if (c.threadAtGeneration === null) {
        return throwNullException("c.threadAtGeneration");
      }
      c.originalThreadIndex = c.threadAtGeneration.threadIndex;

      if (this.callStack.ThreadWithIndex(c.originalThreadIndex) === null) {
        if (!hasChoiceThreads) {
          hasChoiceThreads = true;
          writer.WritePropertyStart("choiceThreads");
          writer.WriteObjectStart();
        }

        writer.WritePropertyStart(c.originalThreadIndex);
        c.threadAtGeneration.WriteJson(writer);
        writer.WritePropertyEnd();
      }
    }

    if (hasChoiceThreads) {
      writer.WriteObjectEnd();
      writer.WritePropertyEnd();
    }

    // In the following two calls, `WriteJson` is called inside an arrow
    // function to make sure `this` is correctly bound and passed down
    // the call hierarchy.

    writer.WriteProperty("callstackThreads", (w) =>
      this.callStack.WriteJson(w)
    );

    writer.WriteProperty("variablesState", (w) =>
      this.variablesState.WriteJson(w)
    );

    writer.WriteProperty("evalStack", (w) =>
      JsonSerialisation.WriteListRuntimeObjs(w, this.evaluationStack)
    );

    writer.WriteProperty("outputStream", (w) =>
      JsonSerialisation.WriteListRuntimeObjs(w, this._outputStream)
    );

    writer.WriteProperty("currentChoices", (w) => {
      w.WriteArrayStart();
      for (let c of this._currentChoices) JsonSerialisation.WriteChoice(w, c);
      w.WriteArrayEnd();
    });

    if (!this.divertedPointer.isNull) {
      if (this.divertedPointer.path === null) {
        return throwNullException("divertedPointer");
      }
      writer.WriteProperty(
        "currentDivertTarget",
        this.divertedPointer.path.componentsString
      );
    }

    writer.WriteProperty("visitCounts", (w) =>
      JsonSerialisation.WriteIntDictionary(w, this._visitCounts)
    );
    writer.WriteProperty("turnIndices", (w) =>
      JsonSerialisation.WriteIntDictionary(w, this._turnIndices)
    );

    writer.WriteIntProperty("turnIdx", this.currentTurnIndex);
    writer.WriteIntProperty("storySeed", this.storySeed);
    writer.WriteIntProperty("previousRandom", this.previousRandom);

    writer.WriteIntProperty("inkSaveVersion", this.kInkSaveStateVersion);

    writer.WriteIntProperty("inkFormatVersion", Story.inkVersionCurrent);

    writer.WriteObjectEnd();
  }

  public LoadJsonObj(value: Record<string, any>) {
    let jObject = value;

    let jSaveVersion = jObject["inkSaveVersion"];
    if (jSaveVersion == null) {
      throw new StoryException("ink save format incorrect, can't load.");
    } else if (parseInt(jSaveVersion) < this.kMinCompatibleLoadVersion) {
      throw new StoryException(
        "Ink save format isn't compatible with the current version (saw '" +
          jSaveVersion +
          "', but minimum is " +
          this.kMinCompatibleLoadVersion +
          "), so can't load."
      );
    }

    this.callStack.SetJsonToken(jObject["callstackThreads"], this.story);
    this.variablesState.SetJsonToken(jObject["variablesState"]);

    this._evaluationStack = JsonSerialisation.JArrayToRuntimeObjList(
      jObject["evalStack"]
    );

    this._outputStream = JsonSerialisation.JArrayToRuntimeObjList(
      jObject["outputStream"]
    );
    this.OutputStreamDirty();

    // currentChoices = Json.JArrayToRuntimeObjList<Choice>((JArray)jObject ["currentChoices"]);
    this._currentChoices = JsonSerialisation.JArrayToRuntimeObjList(
      jObject["currentChoices"]
    ) as Choice[];

    let currentDivertTargetPath = jObject["currentDivertTarget"];
    if (currentDivertTargetPath != null) {
      let divertPath = new Path(currentDivertTargetPath.toString());
      this.divertedPointer = this.story.PointerAtPath(divertPath);
    }

    this._visitCounts = JsonSerialisation.JObjectToIntDictionary(
      jObject["visitCounts"]
    );
    this._turnIndices = JsonSerialisation.JObjectToIntDictionary(
      jObject["turnIndices"]
    );
    this.currentTurnIndex = parseInt(jObject["turnIdx"]);
    this.storySeed = parseInt(jObject["storySeed"]);
    this.previousRandom = parseInt(jObject["previousRandom"]);

    // var jChoiceThreads = jObject["choiceThreads"] as JObject;
    let jChoiceThreads = jObject["choiceThreads"] as Record<string, any>;

    for (let c of this._currentChoices) {
      let foundActiveThread = this.callStack.ThreadWithIndex(
        c.originalThreadIndex
      );
      if (foundActiveThread != null) {
        c.threadAtGeneration = foundActiveThread.Copy();
      } else {
        let jSavedChoiceThread =
          jChoiceThreads[c.originalThreadIndex.toString()];
        c.threadAtGeneration = new CallStack.Thread(
          jSavedChoiceThread,
          this.story
        );
      }
    }
  }

  public ResetErrors() {
    this._currentErrors = null;
    this._currentWarnings = null;
  }
  public ResetOutput(objs: InkObject[] | null = null) {
    this._outputStream.length = 0;
    if (objs !== null) this._outputStream.push(...objs);
    this.OutputStreamDirty();
  }

  public PushToOutputStream(obj: InkObject | null) {
    // var text = obj as StringValue;
    let text = asOrNull(obj, StringValue);
    if (text !== null) {
      let listText = this.TrySplittingHeadTailWhitespace(text);
      if (listText !== null) {
        for (let textObj of listText) {
          this.PushToOutputStreamIndividual(textObj);
        }
        this.OutputStreamDirty();
        return;
      }
    }

    this.PushToOutputStreamIndividual(obj);
    this.OutputStreamDirty();
  }

  public PopFromOutputStream(count: number) {
    this.outputStream.splice(this.outputStream.length - count, count);
    this.OutputStreamDirty();
  }

  public TrySplittingHeadTailWhitespace(single: StringValue) {
    let str = single.value;
    if (str === null) {
      return throwNullException("single.value");
    }

    let headFirstNewlineIdx = -1;
    let headLastNewlineIdx = -1;
    for (let i = 0; i < str.length; ++i) {
      let c = str[i];
      if (c == "\n") {
        if (headFirstNewlineIdx == -1) headFirstNewlineIdx = i;
        headLastNewlineIdx = i;
      } else if (c == " " || c == "\t") continue;
      else break;
    }

    let tailLastNewlineIdx = -1;
    let tailFirstNewlineIdx = -1;
    for (let i = 0; i < str.length; ++i) {
      let c = str[i];
      if (c == "\n") {
        if (tailLastNewlineIdx == -1) tailLastNewlineIdx = i;
        tailFirstNewlineIdx = i;
      } else if (c == " " || c == "\t") continue;
      else break;
    }

    // No splitting to be done?
    if (headFirstNewlineIdx == -1 && tailLastNewlineIdx == -1) return null;

    let listTexts: StringValue[] = [];
    let innerStrStart = 0;
    let innerStrEnd = str.length;

    if (headFirstNewlineIdx != -1) {
      if (headFirstNewlineIdx > 0) {
        let leadingSpaces = new StringValue(
          str.substring(0, headFirstNewlineIdx)
        );
        listTexts.push(leadingSpaces);
      }
      listTexts.push(new StringValue("\n"));
      innerStrStart = headLastNewlineIdx + 1;
    }

    if (tailLastNewlineIdx != -1) {
      innerStrEnd = tailFirstNewlineIdx;
    }

    if (innerStrEnd > innerStrStart) {
      let innerStrText = str.substring(
        innerStrStart,
        innerStrEnd - innerStrStart
      );
      listTexts.push(new StringValue(innerStrText));
    }

    if (tailLastNewlineIdx != -1 && tailFirstNewlineIdx > headLastNewlineIdx) {
      listTexts.push(new StringValue("\n"));
      if (tailLastNewlineIdx < str.length - 1) {
        let numSpaces = str.length - tailLastNewlineIdx - 1;
        let trailingSpaces = new StringValue(
          str.substring(tailLastNewlineIdx + 1, numSpaces)
        );
        listTexts.push(trailingSpaces);
      }
    }

    return listTexts;
  }

  public PushToOutputStreamIndividual(obj: InkObject | null) {
    let glue = asOrNull(obj, Glue);
    let text = asOrNull(obj, StringValue);

    let includeInOutput = true;

    if (glue) {
      this.TrimNewlinesFromOutputStream();
      includeInOutput = true;
    } else if (text) {
      let functionTrimIndex = -1;
      let currEl = this.callStack.currentElement;
      if (currEl.type == PushPopType.Function) {
        functionTrimIndex = currEl.functionStartInOutputStream;
      }

      let glueTrimIndex = -1;
      for (let i = this._outputStream.length - 1; i >= 0; i--) {
        let o = this._outputStream[i];
        let c = o instanceof ControlCommand ? o : null;
        let g = o instanceof Glue ? o : null;

        if (g != null) {
          glueTrimIndex = i;
          break;
        } else if (
          c != null &&
          c.commandType == ControlCommand.CommandType.BeginString
        ) {
          if (i >= functionTrimIndex) {
            functionTrimIndex = -1;
          }
          break;
        }
      }

      let trimIndex = -1;
      if (glueTrimIndex != -1 && functionTrimIndex != -1)
        trimIndex = Math.min(functionTrimIndex, glueTrimIndex);
      else if (glueTrimIndex != -1) trimIndex = glueTrimIndex;
      else trimIndex = functionTrimIndex;

      if (trimIndex != -1) {
        if (text.isNewline) {
          includeInOutput = false;
        } else if (text.isNonWhitespace) {
          if (glueTrimIndex > -1) this.RemoveExistingGlue();

          if (functionTrimIndex > -1) {
            let callStackElements = this.callStack.elements;
            for (let i = callStackElements.length - 1; i >= 0; i--) {
              let el = callStackElements[i];
              if (el.type == PushPopType.Function) {
                el.functionStartInOutputStream = -1;
              } else {
                break;
              }
            }
          }
        }
      } else if (text.isNewline) {
        if (this.outputStreamEndsInNewline || !this.outputStreamContainsContent)
          includeInOutput = false;
      }
    }

    if (includeInOutput) {
      if (obj === null) {
        return throwNullException("obj");
      }
      this._outputStream.push(obj);
      this.OutputStreamDirty();
    }
  }

  public TrimNewlinesFromOutputStream() {
    let removeWhitespaceFrom = -1;

    let i = this._outputStream.length - 1;
    while (i >= 0) {
      let obj = this._outputStream[i];
      let cmd = asOrNull(obj, ControlCommand);
      let txt = asOrNull(obj, StringValue);

      if (cmd != null || (txt != null && txt.isNonWhitespace)) {
        break;
      } else if (txt != null && txt.isNewline) {
        removeWhitespaceFrom = i;
      }
      i--;
    }

    // Remove the whitespace
    if (removeWhitespaceFrom >= 0) {
      i = removeWhitespaceFrom;
      while (i < this._outputStream.length) {
        let text = asOrNull(this._outputStream[i], StringValue);
        if (text) {
          this._outputStream.splice(i, 1);
        } else {
          i++;
        }
      }
    }

    this.OutputStreamDirty();
  }

  public RemoveExistingGlue() {
    for (let i = this._outputStream.length - 1; i >= 0; i--) {
      let c = this._outputStream[i];
      if (c instanceof Glue) {
        this._outputStream.splice(i, 1);
      } else if (c instanceof ControlCommand) {
        break;
      }
    }

    this.OutputStreamDirty();
  }

  get outputStreamEndsInNewline() {
    if (this._outputStream.length > 0) {
      for (let i = this._outputStream.length - 1; i >= 0; i--) {
        let obj = this._outputStream[i];
        if (obj instanceof ControlCommand) break;
        let text = this._outputStream[i];
        if (text instanceof StringValue) {
          if (text.isNewline) return true;
          else if (text.isNonWhitespace) break;
        }
      }
    }

    return false;
  }

  get outputStreamContainsContent() {
    for (let i = 0; i < this._outputStream.length; i++) {
      if (this._outputStream[i] instanceof StringValue) return true;
    }
    return false;
  }

  get inStringEvaluation() {
    for (let i = this._outputStream.length - 1; i >= 0; i--) {
      // var cmd = this._outputStream[i] as ControlCommand;
      let cmd = asOrNull(this._outputStream[i], ControlCommand);
      if (
        cmd instanceof ControlCommand &&
        cmd.commandType == ControlCommand.CommandType.BeginString
      ) {
        return true;
      }
    }

    return false;
  }

  public PushEvaluationStack(obj: InkObject | null) {
    // var listValue = obj as ListValue;
    let listValue = asOrNull(obj, ListValue);
    if (listValue) {
      // Update origin when list is has something to indicate the list origin
      let rawList = listValue.value;
      if (rawList === null) {
        return throwNullException("rawList");
      }

      if (rawList.originNames != null) {
        if (!rawList.origins) rawList.origins = [];
        rawList.origins.length = 0;

        for (let n of rawList.originNames) {
          if (this.story.listDefinitions === null)
            return throwNullException("StoryState.story.listDefinitions");
          let def = this.story.listDefinitions.TryListGetDefinition(n, null);
          if (def.result === null)
            return throwNullException("StoryState def.result");
          if (rawList.origins.indexOf(def.result) < 0)
            rawList.origins.push(def.result);
        }
      }
    }

    if (obj === null) {
      return throwNullException("obj");
    }
    this.evaluationStack.push(obj);
  }

  public PopEvaluationStack(): InkObject;
  public PopEvaluationStack(numberOfObjects: number): InkObject[];
  public PopEvaluationStack(numberOfObjects?: number) {
    if (typeof numberOfObjects === "undefined") {
      let obj = this.evaluationStack.pop();
      return nullIfUndefined(obj);
    } else {
      if (numberOfObjects > this.evaluationStack.length) {
        throw new Error("trying to pop too many objects");
      }

      let popped = this.evaluationStack.splice(
        this.evaluationStack.length - numberOfObjects,
        numberOfObjects
      );
      return nullIfUndefined(popped);
    }
  }

  public PeekEvaluationStack() {
    return this.evaluationStack[this.evaluationStack.length - 1];
  }

  public ForceEnd() {
    this.callStack.Reset();

    this._currentChoices.length = 0;

    this.currentPointer = Pointer.Null;
    this.previousPointer = Pointer.Null;

    this.didSafeExit = true;
  }

  public TrimWhitespaceFromFunctionEnd() {
    Debug.Assert(this.callStack.currentElement.type == PushPopType.Function);
    let functionStartPoint = this.callStack.currentElement
      .functionStartInOutputStream;

    if (functionStartPoint == -1) {
      functionStartPoint = 0;
    }

    for (let i = this._outputStream.length - 1; i >= functionStartPoint; i--) {
      let obj = this._outputStream[i];
      let txt = asOrNull(obj, StringValue);
      let cmd = asOrNull(obj, ControlCommand);

      if (txt == null) continue;
      if (cmd) break;

      if (txt.isNewline || txt.isInlineWhitespace) {
        this._outputStream.splice(i, 1);
        this.OutputStreamDirty();
      } else {
        break;
      }
    }
  }

  public PopCallStack(popType: PushPopType | null = null) {
    if (this.callStack.currentElement.type == PushPopType.Function)
      this.TrimWhitespaceFromFunctionEnd();

    this.callStack.Pop(popType);
  }

  public SetChosenPath(path: Path, incrementingTurnIndex: boolean) {
    // Changing direction, assume we need to clear current set of choices
    this._currentChoices.length = 0;

    let newPointer = this.story.PointerAtPath(path);
    if (!newPointer.isNull && newPointer.index == -1) newPointer.index = 0;

    this.currentPointer = newPointer;

    if (incrementingTurnIndex) {
      this.currentTurnIndex++;
    }
  }

  public StartFunctionEvaluationFromGame(
    funcContainer: Container,
    args: any[]
  ) {
    this.callStack.Push(
      PushPopType.FunctionEvaluationFromGame,
      this.evaluationStack.length
    );
    this.callStack.currentElement.currentPointer = Pointer.StartOf(
      funcContainer
    );

    this.PassArgumentsToEvaluationStack(args);
  }

  public PassArgumentsToEvaluationStack(args: any[]) {
    // Pass arguments onto the evaluation stack
    if (args != null) {
      for (let i = 0; i < args.length; i++) {
        if (!(typeof args[i] === "number" || typeof args[i] === "string")) {
          throw new Error(
            "ink arguments when calling EvaluateFunction / ChoosePathStringWithParameters  must be int, float or string"
          );
        }

        this.PushEvaluationStack(Value.Create(args[i]));
      }
    }
  }

  public TryExitFunctionEvaluationFromGame() {
    if (
      this.callStack.currentElement.type ==
      PushPopType.FunctionEvaluationFromGame
    ) {
      this.currentPointer = Pointer.Null;
      this.didSafeExit = true;
      return true;
    }

    return false;
  }

  public CompleteFunctionEvaluationFromGame() {
    if (
      this.callStack.currentElement.type !=
      PushPopType.FunctionEvaluationFromGame
    ) {
      throw new StoryException(
        "Expected external function evaluation to be complete. Stack trace: " +
          this.callStack.callStackTrace
      );
    }

    let originalEvaluationStackHeight = this.callStack.currentElement
      .evaluationStackHeightWhenPushed;

    let returnedObj: InkObject | null = null;
    while (this.evaluationStack.length > originalEvaluationStackHeight) {
      let poppedObj = this.PopEvaluationStack();
      if (returnedObj === null) returnedObj = poppedObj;
    }

    this.PopCallStack(PushPopType.FunctionEvaluationFromGame);

    if (returnedObj) {
      if (returnedObj instanceof Void) return null;

      // Some kind of value, if not void
      // var returnVal = returnedObj as Runtime.Value;
      let returnVal = asOrThrows(returnedObj, Value);

      // DivertTargets get returned as the string of components
      // (rather than a Path, which isn't public)
      if (returnVal.valueType == ValueType.DivertTarget) {
        return returnVal.valueObject.toString();
      }

      // Other types can just have their exact object type:
      // int, float, string. VariablePointers get returned as strings.
      return returnVal.valueObject;
    }

    return null;
  }

  public AddError(message: string, isWarning: boolean) {
    if (!isWarning) {
      if (this._currentErrors == null) this._currentErrors = [];
      this._currentErrors.push(message);
    } else {
      if (this._currentWarnings == null) this._currentWarnings = [];
      this._currentWarnings.push(message);
    }
  }

  public OutputStreamDirty() {
    this._outputStreamTextDirty = true;
    this._outputStreamTagsDirty = true;
  }

  private _visitCounts: Map<string, number>;
  private _turnIndices: Map<string, number>;

  private _outputStream: InkObject[];
  private _outputStreamTextDirty = true;
  private _outputStreamTagsDirty = true;
  private _currentChoices: Choice[];

  private _patch: StatePatch | null = null;
}
