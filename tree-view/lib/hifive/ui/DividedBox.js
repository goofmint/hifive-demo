/*
 * Copyright (C) 2012-2014 NS Solutions Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
(function() {
	var DATA_STATE = 'state';
	var DATA_DEFAULT_STATE = 'default-state';
	var EVENT_STATE_CHANGE = 'state-change';
	var selectBoxController = {
		__name: 'h5.ui.container.StateBox',
		_currentState: null,
		__init: function() {
			// 初期stateの設定
			var $stateBoxes = this._getAllStateBoxes();
			var defaultState = $(this.rootElement).data(DATA_DEFAULT_STATE);
			if (defaultState) {
				// defaultが設定されている場合はデフォルト
				this.setState(defaultState);
			} else {
				// defaultが設定されていない場合は最初の要素を表示
				this.setState($stateBoxes.data(DATA_STATE));
			}

			//FIXME ルートエレメントからこのコントローラを辿れるようにjQuery.dataを使って覚えさせておく
			// (getControllers()を使ったDOM->Controllerの特定は子コントローラの場合にできないため)
			$(this.rootElement).data('h5controller-statebox-instance', this);
		},
		setState: function(state) {
			if (this._currentState === state) {
				return;
			}
			var $target = this._getStateBoxByState(state);
			if (!$target.length) {
				this.log.warn('指定されたstateの要素はありません。{}', state);
				return;
			}
			var $stateBoxes = this.$find('>*[data-' + DATA_STATE + ']');
			$stateBoxes.css('display', 'none');
			$target.css('display', 'block');
			this._currentState = state;
			this.trigger(EVENT_STATE_CHANGE, state);
		},
		getState: function() {
			return this._currentState;
		},
		getContentsSize: function() {
			var $current = this._getStateBoxByState(this._currentState);
			// TODO outerWidth/Heightかどうかはオプション？
			return {
				width: $current.outerWidth(),
				height: $current.outerHeight()
			};
		},
		_getAllStateBoxes: function() {
			return this.$find('>[data-' + DATA_STATE + ']');
		},
		_getStateBoxByState: function(state) {
			return this.$find('>[data-' + DATA_STATE + '="' + state + '"]');
		},
		__unbind: function() {
			$(this.rootElement).data('h5controller-statebox-instance', null);
		}
	};
	h5.core.expose(selectBoxController);
})();

(function() {
	/** データ属性名：ボックスが隠れているかどうか */
	var DATA_HIDDEN = 'dividedbox-boxhidden';

	/** クラス名：dividedBoxルートに指定。垂直区切り設定 */
	var CLASS_VERTICAL = 'vertical';

	/** クラス名：dividedBoxルートに指定。水平区切り設定 */
	var CLASS_HORIZONTAL = 'horizontal';

	/** クラス名：dividedBoxのルートに指定。初期化時にdividedBoxのサイズをboxのサイズに因らず固定にする。 */
	var CLASS_FREEZE_SIZE = 'freezeSize';

	/** クラス名：boxに指定。サイズの自動調整設定 */
	var CLASS_AUTO_SIZE = 'autoSize';

	/** クラス名：boxに指定。dividerによるサイズ変更不可 */
	var CLASS_FIXED_BOX = 'fixedSize';

	/** クラス名：divderに指定。操作不可 */
	var CLASS_FIXED_DIVIDER = 'fixedDivider';

	/** dividedBoxによって位置を管理されているboxかどうか(動的に追加される要素についても位置計算時のこのクラスが追加される) */
	var CLASS_MANAGED = 'dividedbox-managed';

	/** クラス名: dividedBoxのルートに追加するクラス名 */
	var CLASS_ROOT = 'dividedBox';

	/** イベント名：ボックスのサイズが変更されたときに上げるイベント */
	var EVENT_BOX_SIZE_CHANGE = 'boxSizeChange';

	/** データ属性: ボックスの最小サイズ。このデータ属性で指定されたサイズ以下には動かないようになる */
	var DATA_MIN_BOX_SIZE = 'min-size';

	var dividedBoxController = {

		__name: 'h5.ui.container.DividedBox',

		_dividerPos: {
			left: 0.5,
			top: 0.5
		},

		_type: null,

		_prevStart: null,

		_nextEnd: null,

		_$root: null,

		_lastAdjustAreaWH: null,

		_l_t: '',

		_w_h: '',

		_outerW_H: '',

		_scrollW_H: '',

		_lastPos: null,

		__init: function(context) {
			var $root = this._$root = $(this.rootElement);
			var type = this._type = $root.hasClass(CLASS_VERTICAL) ? 'y' : 'x';

			// 要素内の空のテキストノードを削除
			this._cleanWhitespace($root[0]);

			$root.addClass(CLASS_ROOT);
			if (type === 'x') {
				$root.addClass(CLASS_HORIZONTAL);
			}

			var w_h = this._w_h = (type === 'x') ? 'width' : 'height';
			this._l_t = (type === 'x') ? 'left' : 'top';

			var outerW_H = this._outerW_H = w_h === 'width' ? 'outerWidth' : 'outerHeight';
			this._scrollW_H = w_h === 'width' ? 'scrollWidth' : 'scrollHeight';

			// frezeSize指定時はdividedBoxのルートを適用時のサイズに固定
			if ($root.hasClass(CLASS_FREEZE_SIZE)) {
				$root.width($root.width());
				$root.height($root.height());
			}

			this._lastAdjustAreaWH = $root[w_h]();
			var rootPosition = $root.css('position');
			if (rootPosition === 'static' || !rootPosition) {
				// ルートがposition:staticまたは指定無しの場合はposition:relativeを設定
				$root.css('position', 'relative');
				if (h5.env.ua.isOpera) {
					$root.css({
						'top': 0,
						'left': 0
					});
				}
			}

			// ボックスのサイズがオートのものについてサイズ計算
			var autoSizeBoxCouunt = 0;
			var autoSizeBoxAreaWH = $root[w_h]();

			var $boxes = this._getBoxes();
			$boxes.each(this.ownWithOrg(function(orgThis) {
				var $box = $(orgThis);
				if ($box.hasClass(CLASS_AUTO_SIZE)) {
					autoSizeBoxCouunt++;
				} else {
					autoSizeBoxAreaWH -= $box[outerW_H](true);
				}
			}));

			if (autoSizeBoxCouunt) {
				// dividerの幅を取得(この時点ではまだdivider未配置のため、ダミーで追加して削除しておく)
				var $dummyDivider = $('<div class="divider"></div>');
				$root.append($dummyDivider);
				var dividerWH = $dummyDivider[outerW_H]();
				$dummyDivider.remove();

				var autoSizeBoxWH = autoSizeBoxAreaWH / autoSizeBoxCouunt - dividerWH
						* ($boxes.length - 1);
				$boxes.each(this.ownWithOrg(function(orgThis) {
					var $box = $(orgThis);
					if ($box.hasClass(CLASS_AUTO_SIZE) && !$box.hasClass(CLASS_FIXED_BOX)) {
						this._setOuterSize($box, w_h, autoSizeBoxWH);
					}
				}));
			}

			// リフレッシュ
			this.refresh();
		},

		/**
		 * ボックスとdividerの位置を最適化します
		 *
		 * @memberOf h5.ui.container.DividedBox
		 */
		refresh: function() {
			var type = this._type;

			// ボックスにクラスCLASS_MANAGEDを追加
			// ボックス間に区切り線がない場合は挿入
			this._getBoxes().addClass(CLASS_MANAGED).filter(':not(.divider) + :not(.divider)')
					.each(function() {
						$(this).before('<div class="divider"></div>');
					});

			//主に、新たに配置した区切り線とその前後のボックスの設定(既存も調整)
			var $dividers = this._getDividers();
			var lastIndex = $dividers.length - 1;
			var appearedUnfix = false;
			$dividers.each(this.ownWithOrg(function(orgThis, index) {
				var isLast = index === lastIndex;
				var $divider = $(orgThis);
				var isVisibleDivider = $divider.css('display') !== 'none';
				var $prev = this._getPrevBoxByDivider($divider);
				var $next = this._getNextBoxByDivider($divider);

				// dividerハンドラーの調整
				var $dividerHandler = $divider.find('.dividerHandler');
				if ($dividerHandler.length === 0) {
					$divider.append('<div style="height:50%;"></div>');
					$dividerHandler = $('<div class="dividerHandler"></div>');
					$divider.append($dividerHandler);
				}
				$dividerHandler.css({
					'margin-top': -$dividerHandler.height() / 2
				});
				if (type === 'y') {
					$dividerHandler.css({
						'margin-left': 'auto',
						'margin-right': 'auto'
					});
				} else {
					$dividerHandler.css({
						'margin-left': ($divider.width() - $dividerHandler.outerWidth()) / 2
					});
				}

				// 操作するとfixedSizeのboxのサイズが変わってしまうような位置のdividerは操作不可
				if ((!isLast || lastIndex === 0)
						&& (!appearedUnfix || $next.hasClass(CLASS_FIXED_BOX))
						&& $prev.hasClass(CLASS_FIXED_BOX)) {
					$divider.addClass(CLASS_FIXED_DIVIDER);
					return;
				}

				var nextZIndex = $next.css('z-index');
				if (!nextZIndex || nextZIndex === 'auto') {
					nextZIndex = 0;
				}

				// dividerの位置調整
				var dividerTop = (type === 'y' && $prev.length) ? $prev.position().top
						+ $prev.outerHeight(true) : 0;
				var dividerLeft = (type === 'x' && $prev.length) ? $prev.position().left
						+ $prev.outerWidth(true) : 0;
				$divider.css({
					top: dividerTop,
					left: dividerLeft,
					position: 'absolute',
					'z-index': nextZIndex + 1
				});
				var nextTop = (type === 'y') ? dividerTop
						+ (isVisibleDivider ? $divider.outerHeight(true) : 0) : 0;
				var nextLeft = (type === 'x') ? dividerLeft
						+ (isVisibleDivider ? $divider.outerWidth(true) : 0) : 0;
				// dividerの次の要素の調整
				$next.css({
					top: nextTop,
					left: nextLeft,
					position: 'absolute'
				});

				// 一番下まで計算が終わったら、
				if (isLast && $next.hasClass(CLASS_FIXED_BOX)) {
					// 最後のboxがfixedの時は、そのboxの前のdividerはfixed
					$divider.addClass(CLASS_FIXED_DIVIDER);
					// fixdeでないboxが出てくるまで、前のdividerを辿って全てfixedにする
					var $p = $prev;
					var $d = $divider;
					while (true) {
						$d.addClass(CLASS_FIXED_DIVIDER);
						$p = this._getPrevBoxByDivider($d);
						if (!$p.hasClass(CLASS_FIXED_BOX)) {
							break;
						}
						$d = this._getPrevDividerByBox($p);
					}
				} else {
					$divider.removeClass(CLASS_FIXED_DIVIDER);
					appearedUnfix = true;
				}
			}));

			//以上の配置を元にルート要素サイズに合わせて再配置
			this._adjust();
		},

		/**
		 * ボックスの追加
		 *
		 * @memberOf h5.ui.container.DividedBox
		 * @param {Integer} index 何番目に追加するか
		 * @param {DOM|jQuery} box
		 */
		insert: function(index, box) {
			var root = this._$root;
			var type = this._type;
			var l_t = this._l_t;
			var t_l = l_t === 'left' ? 'top' : 'left';
			var w_h = this._w_h;
			var outerW_H = this._outerW_H;

			var $target = this._getBoxElement(index);
			var $boxes = this._getBoxes();
			if ($target.length) {
				// 範囲外の場合は一番最後に追加
				$target = $boxes.eq($boxes.length - 1);
			}

			// 追加したボックスにクラスCLASS_MANAGEDを追加
			var $box = $(box);
			$box.addClass(CLASS_MANAGED);

			if ($target.length) {
				$target.after($box);
			} else {
				// 既存のboxが一つもない場合は追加して終了
				root.append($box);
				this._triggerBoxSizeChange();
				return;
			}

			// 前のboxがあるならdividerを追加
			var $divider = $('<div class="divider"></div>');
			var $dividerHandler = $('<div class="dividerHandler"></div>');
			$divider.append('<div style="height:50%;"></div>');
			$dividerHandler = $('<div class="dividerHandler"></div>');
			$divider.append($dividerHandler);
			$dividerHandler.css({
				'margin-top': -$dividerHandler.height() / 2
			});
			if (type === 'y') {
				$dividerHandler.css({
					'margin-left': 'auto',
					'margin-right': 'auto'
				});
			} else {
				$dividerHandler.css({
					'margin-left': ($divider.width() - $dividerHandler.width()) / 2
				});
			}
			//jQueryが古いと以下のようにする必要があるかもしれない。1.8.3だと以下で動作しない。何かのオブジェクトが返ってくる。
			//divider.css(l_t, target.position()[l_t] + target[outerW_H]({margin:true}));
			$divider.css(l_t, $target.length ? $target.position()[l_t] + $target[outerW_H](true)
					: 0);
			$divider.css(t_l, $divider.position()[t_l]);
			$divider.css('position', 'absolute');
			$box.before($divider);

			var targetWH = $target[w_h](true) - $divider[outerW_H](true) - $box[outerW_H](true);

			var mbpSize = this._getMBPSize($target, w_h);
			if (targetWH <= mbpSize) {
				targetWH = mbpSize + 1;
			}
			this._setOuterSize($target, w_h, targetWH);

			$box.css(l_t, $divider.position()[l_t] + $divider[outerW_H](true));
			$box.css(t_l, 0);
			$box.css('position', 'absolute');

			var $nextDivider = this._getNextDividerByBox($box);
			var distance = 0;
			if ($nextDivider.length) {
				distance = $nextDivider.position()[l_t] - $box.position()[l_t];
			} else {
				distance = root[w_h]() - $box.position()[l_t];
			}
			var boxOuterWH = $box[outerW_H](true);
			if (distance < boxOuterWH) {
				this._setOuterSize($box, w_h, distance);
			}

			this._triggerBoxSizeChange();
		},

		/**
		 * ボックスの削除
		 *
		 * @memberOf h5.ui.container.DividedBox
		 * @param {Integer} index 何番目のボックスを削除するか
		 */
		remove: function(index) {
			var $target = this._getBoxElement(index);
			if (!$target.length) {
				// ターゲットとなるボックスが無い場合は何もしない
				return;
			}
			var $prevDivider = this._getPrevDividerByBox($target);
			if ($prevDivider.length) {
				$prevDivider.remove();
			} else {
				// 先頭要素だった場合は次の要素を先頭に持ってくる
				var $nextDivider = this._getNextDividerByBox($target);
				var $nextBox = this._getNextBoxByDivider($nextDivider);
				$nextBox.css(this._l_t, $target.css(this._l_t));
				$nextDivider.remove();
			}
			$target.remove();
			this.refresh();
		},

		/**
		 * ボックスの最小化
		 *
		 * @memberOf h5.ui.container.DividedBox
		 * @param {index|DOM|jQuery|String} box boxのindexまたはbox要素またはセレクタ
		 * @param {Object} opt {@link h5.ui.container.DividedBox#resize}のオプションと同じです
		 */
		minimize: function(box, opt) {
			this.resize(box, 0, opt);
		},

		/**
		 * ボックスの最大化
		 *
		 * @memberOf h5.ui.container.DividedBox
		 * @param {index|DOM|jQuery|String} box boxのindexまたはbox要素またはセレクタ
		 * @param {Object} opt {@link h5.ui.container.DividedBox#resize}のオプションと同じです
		 */
		maximize: function(box, opt) {
			this.resize(box, $(this.rootElement)[this._w_h](), $.extend({}, opt, {
				partition: 0.5
			}));
		},

		/**
		 * ボックスの中身の大きさを自動取得し、そのサイズにリサイズします
		 *
		 * @memberOf h5.ui.container.DividedBox
		 * @param {index|DOM|jQuery|String} box boxのindexまたはbox要素またはセレクタ
		 * @param {Object} opt {@link h5.ui.container.DividedBox#resize}のオプションと同じです
		 */
		fitToContents: function(box, opt) {
			this.resize(box, null, opt);
		},

		/**
		 * {@link h5.ui.container.DividedBox#hide}で非表示にしたボックスを表示します
		 *
		 * @memberOf h5.ui.container.DividedBox
		 * @param {index|DOM|jQuery|String} box boxのindexまたはbox要素またはセレクタ
		 * @param {Object} opt {@link h5.ui.container.DividedBox#resize}のオプションと同じです
		 */
		show: function(box, opt) {
			// hide状態のボックスを表示
			var $box = this._getBoxElement(box);
			if (!$box.length || !$box.data(DATA_HIDDEN)) {
				return;
			}
			$box.data(DATA_HIDDEN, false);
			// 指定されたindexのボックスの両隣のdividerを表示する
			var $prevDivider = this._getPrevDividerByBox($box);
			var $nextDivider = this._getNextDividerByBox($box);
			if ($prevDivider.length) {
				this.showDivider($prevDivider);
			} else if ($nextDivider.length) {
				this.showDivider($nextDivider, true);
			}

			// コンテンツの大きさにリサイズ
			this.fitToContents(box, opt);
		},

		/**
		 * ボックスを非表示にします
		 *
		 * @memberOf h5.ui.container.DividedBox
		 * @param {index|DOM|jQuery|String} box boxのindexまたはbox要素またはセレクタ
		 * @param {Object} opt {@link h5.ui.container.DividedBox#resize}のオプションと同じです
		 */
		hide: function(box, opt) {
			var $box = this._getBoxElement(box);
			if (!$box.length) {
				return;
			}
			// 指定されたindexの左(上)側ボックスのどちらか片方のdividerを非表示にする
			// 右(下)側にdividerのあるboxの場合、そのdividerは隠されたboxを無視して動作するdividerとして動作する
			// 左(上)端のボックスでdividerが右(下)にしかない場合はそのdividerを非表示にする
			var $prevDivider = this._getPrevDividerByBox($box);
			var $nextDivider = this._getNextDividerByBox($box);
			if ($prevDivider.length) {
				this.hideDivider($prevDivider);
			} else if ($nextDivider) {
				this.hideDivider($nextDivider, true);
			}

			// 0にリサイズ
			this.resize(box, 0, opt);

			$box.data(DATA_HIDDEN, true);
		},

		/**
		 * ボックスのサイズ変更を行います
		 *
		 * @param {index|DOM|jQuery|String} box boxのindexまたはbox要素またはセレクタ
		 * @param {Integer} size リサイズするサイズ
		 * @param {Object} opt リサイズオプション
		 * @param {Number} [opt.partition=0]
		 *            <p>
		 *            左右(上下)にdividerがある場合、resize時に左右(上下)のdividerが動く割合を0.0～1.0を指定します。
		 *            </p>
		 *            <p>
		 *            0.0を指定した場合(デフォルト)は左(上)のdividerを固定して右(下)のdividerの位置が変更されます。
		 *            </p>
		 *            <p>
		 *            左右(上下)のどちらかにしかdividerが無い場合はこのオプションは無視されてresize時に位置が変更されるdividerは自動で決定されます。
		 *            </p>
		 */
		resize: function(box, size, opt) {
			var opt = opt || {};
			var partition = parseFloat(opt.partition) || 0;

			var w_h = this._w_h;
			var outerW_H = this._outerW_H;

			var $targetBox = this._getBoxElement(box);

			// partitionに合わせて両サイドのdividerを動かす
			// dividerがそもそも片方にしか無い場合はpartitionに関係なくその1つのdividerを動かす
			var $prevDivider = this._getPrevDividerByBox($targetBox);
			var $nextDivider = this._getNextDividerByBox($targetBox);

			if (!$prevDivider.length && !$nextDivider.length) {
				// dividerが無い場合は何もしない
				return;
			}

			if (size == null) {
				// nullの場合は中身の要素を設定
				// 中身がはみ出ている場合はscrollWidth|Heigthで取得できる
				// 中身が小さい場合は取得できないが、StateBoxの場合は取得できる

				// FIXME StateBoxが子コントローラだった場合はgetControllers()で取得できないので、data属性を使って取得
				var stateBox = $targetBox.data('h5controller-statebox-instance');
				if (stateBox && stateBox.getContentsSize) {
					size = stateBox.getContentsSize()[w_h];
				} else {
					size = $targetBox[0][this._scrollW_H];
				}
			}

			var totalMove = size - $targetBox[outerW_H]();
			if (!$prevDivider.length) {
				partition = 0;
			} else if (!$nextDivider.length) {
				partition = 1;
			}
			var prevMove = -totalMove * partition;
			var nextMove = totalMove + prevMove;

			var isFixedSize = $targetBox.hasClass(CLASS_FIXED_BOX);
			// reisze対象のboxがfixedSizeの場合はfixedSize指定を一旦無視してリサイズする
			if (isFixedSize) {
				$targetBox.removeClass(CLASS_FIXED_BOX);
			}
			if (prevMove) {
				this._move(prevMove, $prevDivider);
			}
			if (nextMove) {
				this._move(nextMove, $nextDivider);
			}

			// 一旦外したfixedSize指定を再設定
			if (isFixedSize) {
				$targetBox.addClass(CLASS_FIXED_BOX);
			}
			this._triggerBoxSizeChange();
		},

		/**
		 * ボックスを今のサイズで固定にする
		 *
		 * @memberOf h5.ui.container.DividedBox*
		 * @param {index|DOM|jQuery|String} box boxのindexまたはbox要素またはセレクタ
		 */
		fixSize: function(box) {
			var $targetBox = this._getBoxElement(box);
			$targetBox.addClass(CLASS_FIXED_BOX);
			this.refresh();
		},

		/**
		 * ボックスの固定を解除する
		 *
		 * @memberOf h5.ui.container.DividedBox*
		 * @param {index|DOM|jQuery|String} box boxのindexまたはbox要素またはセレクタ
		 */
		unfixSize: function(box) {
			var $targetBox = this._getBoxElement(box);
			$targetBox.removeClass(CLASS_FIXED_BOX);
			this.refresh();
		},

		/**
		 * dividerのトラック操作開始時イベントハンドラ
		 *
		 * @memberOf h5.ui.container.DividedBox
		 * @param context
		 */
		'> .divider h5trackstart': function(context) {
			var $divider = $(context.event.currentTarget);
			var l_t = this._l_t;
			var outerW_H = this._outerW_H;
			if ($divider.hasClass(CLASS_FIXED_DIVIDER)) {
				return;
			}
			this._lastPos = $divider.position();

			// 同時に動かす要素。dividerの前後のboxがサイズ固定なら、そのサイズを変えないように同時に動かす
			var $dividerGroup = this._getDividerGroup($divider);
			var $groupFirst = $dividerGroup.eq(0);
			var $groupLast = $dividerGroup.eq($dividerGroup.length - 1);
			var $groupPrev = this._getPrevBoxByDivider($groupFirst);
			var $groupNext = this._getNextBoxByDivider($groupLast);
			var afterWH = 0;
			var beforeWH = 0;
			var isAfter = false;
			$dividerGroup.each(function() {
				if (!isAfter && this === $divider[0]) {
					isAfter = true;
				}
				if (!isAfter) {
					beforeWH += $(this)[outerW_H](true);
				}
				if (isAfter) {
					afterWH += $(this)[outerW_H](true);
				}
			});
			this._$dividerGroup = $dividerGroup;
			// 可動範囲をh5trackstartの時点で決定する
			// 両サイドのボックスで最小サイズが指定されている場合は、両サイドが指定されたサイズより小さくならないようにする
			this._prevStart = beforeWH + $groupPrev.position()[l_t]
					+ ($groupPrev.data(DATA_MIN_BOX_SIZE) || 0);
			this._nextEnd = $groupNext.position()[l_t] + $groupNext[outerW_H](true) - afterWH
					- ($groupNext.data(DATA_MIN_BOX_SIZE) || 0);
		},

		/**
		 * dividerのトラック操作中イベントハンドラ
		 *
		 * @memberOf h5.ui.container.DividedBox
		 * @param context
		 */
		'> .divider h5trackmove': function(context) {
			var $divider = $(context.event.currentTarget);
			if ($divider.hasClass(CLASS_FIXED_DIVIDER)) {
				return;
			}
			context.event.preventDefault();
			var l_t = this._l_t;
			var move = (l_t === 'left') ? context.event.dx : context.event.dy;
			if (move === 0)
				return;
			this._move(move, $divider, this._$dividerGroup, this._prevStart, this._nextEnd,
					this._lastPos, true);
			this._lastPos = $divider.position();

			this._triggerBoxSizeChange();
		},

		/**
		 * dividerのトラック操作終了イベントハンドラ
		 *
		 * @memberOf h5.ui.container.DividedBox
		 * @param context
		 */
		'> .divider h5trackend': function(context) {
			// キャッシュした値のクリア
			this._lastPos = null;
			this._prevStart = null;
			this._nextEnd = null;
			this._$dividerGroup = null;
		},

		/**
		 * 指定されたdividerを非表示にする
		 *
		 * @memberOf h5.ui.container.DividedBox
		 * @param {index|DOM|jQuery|String} dividerのindexまたはdivider要素またはセレクタ
		 * @param {Boolean} [fixPrev=false]
		 *            dividerを非表示にするとき、divider分の幅をどちらのボックスで埋めるか。左(上)で埋める場合はtrueを指定。
		 */
		hideDivider: function(divider, fixPrev) {
			var $divider = this._getDividerElement(divider);
			if ($divider.css('display') === 'none') {
				return;
			}
			if (fixPrev) {
				var w_h = this._w_h;
				var l_t = this._l_t;
				var dividerWH = $divider[w_h]();
				this._getPrevBoxByDivider($divider).css(w_h, '+=' + dividerWH);
			}
			$divider.css('display', 'none');
			this.refresh();
		},

		/**
		 * 指定されたdividerを表示する
		 *
		 * @memberOf h5.ui.container.DividedBox
		 * @param {index|DOM|jQuery|String} dividerのindexまたはdivider要素またはセレクタ
		 * @param {Boolean} [fixPrev=false]
		 *            dividerを表示するとき、divider分の幅をどちらのボックスがずらすか。左(上)をずらす場合はtrueを指定。
		 */
		showDivider: function(divider, fixPrev) {
			var $divider = this._getDividerElement(divider);
			if ($divider.css('display') === 'block') {
				return;
			}
			if (fixPrev) {
				var w_h = this._w_h;
				var l_t = this._l_t;
				var dividerWH = $divider[w_h]();
				this._getPrevBoxByDivider($divider).css(w_h, '-=' + dividerWH);
			}
			$divider.css('display', 'block');
			this.refresh();
		},

		/**
		 * dividerを動かす
		 *
		 * @private
		 * @memberOf h5.ui.container.DividedBox
		 * @param {Integer} move 移動量
		 * @param {DOM|jQuery} divider divider
		 * @param {jQuery} $dividerGroup dividerを動かした時に同時に動く要素。
		 *            dividerの前後のboxがfix指定の時に要素のサイズを変えないように同時に動かす必要がある。 (指定しない場合は、_move内で計算)
		 * @param {Integer} prevStart 左(上)の移動限界位置(指定しない場合は_move内で計算)
		 * @param {Integer} nextStart 右(下)の移動限界位置(指定しない場合は_move内で計算)
		 * @param {Object} lastPost 移動前の位置(指定しない場合は_move内で計算)
		 * @param {Boolean} isTrack トラック操作による呼び出しかどうか
		 */
		_move: function(move, divider, $dividerGroup, prevStart, nextEnd, lastPos, isTrack) {
			if (move === 0) {
				return;
			}
			var $divider = $(divider);
			var l_t = this._l_t;
			var w_h = this._w_h;
			var outerW_H = this._outerW_H;
			var $prev = this._getPrevBoxByDivider($divider);
			var $next = this._getNextBoxByDivider($divider);

			// 負方向への移動時は正方向にあるdividerGroupを探索して同時に動かす
			// 逆に、正方向への移動なら負方向を探索
			var forPlus = move < 0;
			$dividerGroup = $dividerGroup || this._getDividerGroup($divider);
			var $groupFirst = $dividerGroup.eq(0);
			var $groupLast = $dividerGroup.eq($dividerGroup.length - 1);
			var $groupPrev = this._getPrevBoxByDivider($groupFirst);
			var $groupNext = this._getNextBoxByDivider($groupLast);
			if (prevStart == null) {
				// 第3引数が未指定ならprevStart,nextEnd,lastPosはdividerから計算する
				// (トラック操作の場合はキャッシュしてある値を渡しているので計算する必要はない)
				var isVisibleDivider = $divider.css('display') === 'block';
				if (isVisibleDivider) {
					lastPos = $divider.position();
				} else {
					// 非表示の場合はboxの位置を基にする
					lastPos = $next.position();
				}
				// 両サイドのボックスの最小サイズを考慮して可動範囲を決定
				prevStart = $groupPrev.length ? $groupPrev.position()[l_t]
						+ ($groupPrev.data(DATA_MIN_BOX_SIZE) || 0) : 0;
				nextEnd = $groupNext.length ? ($groupNext.position()[l_t]
						+ $groupNext[outerW_H](true) - (isVisibleDivider ? $divider[outerW_H](true)
						: 0))
						- ($groupNext.data(DATA_MIN_BOX_SIZE) || 0) : $divider.position()[l_t];
			}
			var moved = lastPos[l_t] + move;
			if (moved <= prevStart + 1) {
				move = prevStart - lastPos[l_t];
				if (move <= -1 && isTrack)
					return;
			} else if (moved >= nextEnd - 1) {
				move = nextEnd - lastPos[l_t];
				if (move >= 1 && isTrack) {
					return;
				}
			}

			var prevWH = $groupPrev[w_h]() + move;
			if (prevWH < 0) {
				prevWH = 0;
				move = -$groupPrev[w_h]();
			}

			var nextWH = $groupNext[w_h]() - move;
			if (nextWH < 0) {
				nextWH = 0;
			}

			$dividerGroup.each(function() {
				$(this).css(l_t, '+=' + move);
			});
			$groupPrev[w_h](prevWH);
			$groupNext[w_h](nextWH);
			$groupNext.css(l_t, '+=' + move);
		},

		/**
		 * 位置の調整を行う
		 *
		 * @private
		 * @memberOf h5.ui.container.DividedBox
		 */
		_adjust: function() {
			var l_t = this._l_t;
			var w_h = this._w_h;
			var root = this._$root;
			var outerW_H = this._outerW_H;

			var adjustAreaWH = root[w_h]();

			// 各ボックスの割合を保って、ボックスの幅を今の表示幅に合わせる
			var $dividers = this._getDividers();
			$dividers.each(this.ownWithOrg(function(orgThis) {
				var $divider = $(orgThis);
				var isDisplayNone = $divider.css('display') === 'none';
				$divider.css('display', 'block');
				var $next = this._getNextBoxByDivider($divider);
				if ($next.length) {
					var dividerLT = $divider.position()[l_t];
					var per = dividerLT / this._lastAdjustAreaWH;
					var nextDivideLT = Math.round(adjustAreaWH * per);
					var move = nextDivideLT - dividerLT;

					$divider.css(l_t, '+=' + move);
					$next.css(l_t, ($next.position()[l_t] + move));
				}
				if (isDisplayNone) {
					$divider.css('display', 'none');
				}
			}));

			var $boxes = this._getBoxes();
			$boxes.each(this.ownWithOrg(function(orgThis, index) {
				var $box = $(orgThis);
				if ($box.data(DATA_HIDDEN)) {
					return;
				}
				var $prev = this._getPrevDividerByBox($box);
				var $next = this._getNextDividerByBox($box);
				var outerSize = 0;
				// 非表示の場合はいったん表示する(位置取得のため)
				var isPrevDisplayNone = $prev.css('display') === 'none';
				var isNextDisplayNone = $next.css('display') === 'none';
				$prev.css('display', 'block');
				$next.css('display', 'block');
				if (!$prev.length) {
					outerSize = $next.length ? $next.position()[l_t] : adjustAreaWH;
				} else if (!$next.length) {
					outerSize = adjustAreaWH - $prev.position()[l_t]
							- (isPrevDisplayNone ? 0 : $prev[outerW_H](true));
				} else {
					outerSize = $next.position()[l_t] - $prev.position()[l_t]
							- (isPrevDisplayNone ? 0 : $prev[outerW_H](true));
				}
				// 表示にしたdividerを元に戻す
				if (isPrevDisplayNone) {
					$prev.css('display', 'none');
				}
				if (isNextDisplayNone) {
					$next.css('display', 'none');
				}
				// 計算したサイズを設定
				this._setOuterSize($box, w_h, outerSize);
			}));
			this._lastAdjustAreaWH = adjustAreaWH;
		},

		/**
		 * 要素のouterWidthまたはouterHeightがouterSizeになるようにサイズを設定する
		 *
		 * @private
		 * @memberOf h5.ui.container.DividedBox
		 * @param {jQuery} $el
		 * @param {String} w_h 'width'または'height'
		 * @param {Integer} outerSize
		 */
		_setOuterSize: function($el, w_h, outerSize) {
			$el[w_h](outerSize - this._getMBPSize($el, w_h));
		},

		/**
		 * 要素のマージン+ボーダー+パディングの値を計算する
		 *
		 * @private
		 * @memberOf h5.ui.container.DividedBox
		 * @param {jQuery} $el
		 * @param {String} w_h 'width'または'height'
		 */
		_getMBPSize: function(element, w_h) {
			var outerW_H = w_h === 'width' ? 'outerWidth' : 'outerHeight';
			return element[outerW_H](true) - element[w_h]();
		},

		/**
		 * エレメント内のホワイトスペース(===空のTEXT_NODE)を削除
		 * <p>
		 * prototype.js v1.5.0のElement.cleanWhitespace()相当のことを行っている
		 * </p>
		 *
		 * @private
		 * @memberOf h5.ui.container.DividedBox
		 * @param {DOM} element
		 */
		_cleanWhitespace: function(element) {
			var node = element.firstChild;
			while (node) {
				var nextNode = node.nextSibling;
				if (node.nodeType === 3 && !/\S/.test(node.nodeValue))
					element.removeChild(node);
				node = nextNode;
			}
			return element;
		},

		/**
		 * 全てのボックスについて、boxSizeChangeイベントをあげる
		 *
		 * @private
		 * @memberOf h5.ui.container.DividedBox
		 */
		_triggerBoxSizeChange: function() {
			this._getBoxes().each(function() {
				$(this).trigger(EVENT_BOX_SIZE_CHANGE);
			});
		},

		/**
		 * 全てのボックスを取得
		 *
		 * @private
		 * @memberOf h5.ui.container.DividedBox
		 * @returns {jQuery}
		 */
		_getBoxes: function() {
			// ルート要素直下の要素(divider以外)
			// ただし、動的に追加された要素でかつposition:absoluteのものは除く
			// (動的に追加された要素でもposition:absoluteでなければ新規boxとして位置計算の対象にする
			return this.$find('> :not(.divider)').filter(function() {
				return $(this).hasClass(CLASS_MANAGED) || $(this).css('position') !== 'absolute';
			});
		},

		/**
		 * 全てのdividerを取得
		 *
		 * @private
		 * @memberOf h5.ui.container.DividedBox
		 * @returns {jQuery}
		 */
		_getDividers: function() {
			return this.$find('> .divider');
		},

		/**
		 * indexからdividerを返す。DOM,jQueryが渡された場合はdivider要素ならそれを$()でラップして返す
		 *
		 * @private
		 * @memberOf h5.ui.container.DividedBox
		 * @param {index|DOM|jQuery|String} dividerのindexまたはdivider要素またはセレクタ
		 * @returns {jQuery} divider要素。該当するものが無い場合は空jQuery
		 */
		_getDividerElement: function(divider) {
			var $dividers = this._getDividers();
			if (typeof divider === 'number') {
				return $dividers.eq(divider);
			}
			return $dividers.filter(divider).eq(0);
		},


		/**
		 * indexからボックスを返す。DOM,jQueryが渡された場合はdivider要素ならそれを$()でラップして返す
		 *
		 * @memberOf h5.ui.container.DividedBox
		 * @param {index|DOM|jQuery|String} ボックスのindexまたはボックス要素またはセレクタ
		 * @returns {jQuery}
		 */
		_getBoxElement: function(box) {
			var $boxes = this._getBoxes();
			if (typeof box === 'number') {
				return $boxes.eq(box);
			}
			return $boxes.filter(box).eq(0);
		},

		/**
		 * 指定されたdividerの前のボックスを返す
		 * <p>
		 * ただし非表示のボックスは除いてその前のボックスを返す
		 * </p>
		 *
		 * @private
		 * @memberOf h5.ui.container.DividedBox
		 * @returns {jQuery}
		 */
		_getPrevBoxByDivider: function(divider) {
			var $divider = $(divider);
			var $box = $divider.prevAll('.' + CLASS_MANAGED + ':first');
			// hidden状態ならその前のboxを返す。
			// 無い場合は空のjQueryオブジェクトを返す
			if ($box.length && $box.data(DATA_HIDDEN)) {
				return this._getPrevBoxByDivider($box.prev());
			}
			return $box;
		},

		/**
		 * 指定されたdividerの次のボックスを返す
		 * <p>
		 * ただし非表示のボックスは除く
		 * </p>
		 *
		 * @private
		 * @memberOf h5.ui.container.DividedBox
		 * @returns {jQuery}
		 */
		_getNextBoxByDivider: function(divider) {
			var $divider = $(divider);
			var $box = $divider.nextAll('.' + CLASS_MANAGED + ':first');
			// hidden状態ならその次のboxを返す。
			// 無い場合は空のjQueryオブジェクトを返す
			if ($box.length && $box.data(DATA_HIDDEN)) {
				return this._getNextBoxByDivider($box.next());
			}
			return $box;
		},

		/**
		 * 指定されたボックスの前のdividerを返す
		 * <p>
		 * ただし非表示のdividerは除いてその前のdividerを返す
		 * </p>
		 *
		 * @private
		 * @memberOf h5.ui.container.DividedBox
		 * @returns {jQuery}
		 */
		_getPrevDividerByBox: function(box) {
			var $box = $(box);
			var $divider = $box.prevAll('.divider:first');
			// dividerの前にボックスがない(先頭要素)、またはdividerの前のボックスがhiddenなら
			// dividerは無効なので空jQueryを返す
			if ($divider.length
					&& (!$divider.prevAll('.' + CLASS_MANAGED).length || $divider.prevAll(
							'.' + CLASS_MANAGED + ':first').data(DATA_HIDDEN))) {
				return $();
			}
			return $divider;
		},

		/**
		 * 指定されたボックスの次のdividerを返す
		 * <p>
		 * ただし非表示のdividerは除いてその次のdividerを返す
		 * </p>
		 *
		 * @private
		 * @memberOf h5.ui.container.DividedBox
		 * @returns {jQuery}
		 */
		_getNextDividerByBox: function(box) {
			var $box = $(box);
			var $divider = $box.nextAll('.divider:first');
			// 次のボックスがhiddenならその次のdividerを返す
			if ($divider.length && $divider.next().data(DATA_HIDDEN)) {
				return this._getNextDividerByBox($divider.next());
			}
			return $divider;
		},

		/**
		 * dividerを動かす時にそのdividerと連動して動く要素(divider,box)をjQueryオブジェクトで返す
		 *
		 * @private
		 * @memberOf h5.ui.container.DividedBox
		 */
		_getDividerGroup: function($divider) {
			var $result = $divider;
			var $d = $divider;
			var $b = this._getNextBoxByDivider($d);
			while (true) {
				if (!$b.hasClass(CLASS_FIXED_BOX)) {
					break;
				}
				$result = $result.add($b);
				$d = this._getNextDividerByBox($b);
				$result = $result.add($d);
				$b = this._getNextBoxByDivider($d);
			}
			$d = $divider;
			$b = this._getPrevBoxByDivider($d);
			while (true) {
				if (!$b.hasClass(CLASS_FIXED_BOX)) {
					break;
				}
				$result = $result.add($b);
				$d = this._getPrevDividerByBox($b);
				$result = $result.add($d);
				$b = this._getPrevBoxByDivider($d);
			}
			return $result;
		},

		/**
		 * @private
		 * @memberOf h5.ui.container.DividedBox
		 */
		__unbind: function() {
			var $root = this._$root = $(this.rootElement);
			$root.removeClass(CLASS_ROOT);
			$root.attr('style', '');
			this.$find('.divider').remove();
			var $boxes = this.$find('.' + CLASS_MANAGED);
			$boxes.removeClass(CLASS_MANAGED);
			$boxes.attr('style', '');
		}
	};

	h5.core.expose(dividedBoxController);
})();