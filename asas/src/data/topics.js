/**
 * مكتبة العناوين — تجارب المختبر والأعمال الحقلية والمواضيع النظرية لمواد المرحلة الثانية.
 *
 * كل صف: [المعرّف، العنوان، العنوان بالإنجليزية (للبحث عن الصور)، الأنواع المقترحة، كلمات مرادفة]
 * النوع الأول هو الأنسب افتراضيًا، ومنه يُعرف صنف العنوان: تجربة (lab) أو عمل حقلي (field) أو موضوع نظري.
 * المرادفات تجمع العامية والمصطلحات الإنجليزية مكتوبة بالعربية كما يكتبها الطلبة.
 * المعرّفات التي لها مدخل في قاعدة المعرفة (src/data/kb) تعمل دون اتصال بمحتوى كامل.
 */

const RAW = {
  strength: [
    ['tension_test', 'فحص الشد للحديد (Tension Test)', 'tensile test steel specimen', 'lab discussion summary', 'شد تنشن تنشون تنشين حديد طري مطاوع ستريس سترين اجهاد انفعال خضوع منحني معامل المرونة يونك استطالة'],
    ['compression_test', 'فحص الانضغاط (Compression Test)', 'compression test universal testing machine', 'lab discussion', 'انضغاط ضغط كومبريشن كمبريشن خشب حديد زهر'],
    ['torsion_test', 'فحص الالتواء (Torsion Test)', 'torsion testing machine', 'lab discussion', 'التواء لي تورشن تورجن عزم زاوية معامل القص'],
    ['hardness', 'فحص الصلادة: برينل وروكويل (Hardness Test)', 'Brinell hardness test', 'lab discussion compare', 'صلادة هاردنس هاردنيس برينل روكويل فيكرز'],
    ['impact_test', 'فحص الصدم: شاربي وأيزود (Impact Test)', 'Charpy impact test', 'lab discussion compare', 'صدم امباكت شاربي ايزود متانة طاقة الكسر'],
    ['beam_deflection', 'انحراف العتبات البسيطة الإسناد (Deflection of Beams)', 'beam deflection dial gauge', 'lab discussion', 'انحراف عتبة عتبات دفلكشن دفلكشين ديل كيج بيم'],
    ['shear_test', 'فحص القص المزدوج (Double Shear Test)', 'double shear test', 'lab discussion', 'قص شير مزدوج دبل'],
    ['column_buckling', 'انبعاج الأعمدة النحيفة (Buckling of Columns)', 'column buckling Euler', 'lab theory solved discussion', 'انبعاج بكلنك عمود اعمدة اويلر نحافة الحمل الحرج'],
    ['springs_test', 'فحص النوابض الحلزونية (Helical Springs)', 'helical spring compression', 'lab discussion', 'نابض نوابض سبرنك سبرنغ زنبرك صلابة'],
    ['bend_test', 'فحص الثني لحديد التسليح (Bend Test)', 'rebar bend test', 'lab discussion', 'ثني بند بنت حديد تسليح شيش'],
    ['fatigue_test', 'فحص الكلال (Fatigue Test)', 'fatigue testing machine', 'lab theory', 'كلال تعب فتيك فاتيك'],
    ['stress_strain', 'الإجهاد والانفعال وقانون هوك (Stress and Strain)', 'stress strain curve', 'theory solved summary', 'اجهاد انفعال ستريس سترين هوك محوري'],
    ['elastic_constants', 'الثوابت المرنة والعلاقات بينها (E, G, ν, K)', 'elastic modulus material', 'theory solved summary', 'ثوابت مرنة معامل يونك بواسون نسبة بواسون معامل الحجم'],
    ['thermal_stress', 'الإجهادات الحرارية (Thermal Stresses)', 'bridge expansion joint', 'theory solved', 'حراري حرارية تمدد'],
    ['indeterminate_axial', 'الأعضاء غير المحددة استاتيكيًا تحت الأحمال المحورية', 'composite bar axial load', 'solved theory', 'غير محددة استاتيكيا محوري مركب قضبان'],
    ['sfd_bmd', 'مخططات قوة القص وعزم الانحناء (SFD & BMD)', 'shear force bending moment diagram', 'solved theory summary', 'قوة القص عزم الانحناء مخطط شير مومنت دايكرام'],
    ['moment_inertia', 'مركز الثقل وعزم القصور الذاتي للمقاطع', 'moment of inertia cross section', 'solved theory summary', 'عزم القصور الذاتي مركز الثقل سنترويد انرشيا'],
    ['bending_stress', 'إجهادات الانحناء في العتبات (Bending Stress)', 'bending stress beam', 'theory solved summary', 'انحناء بندنك فلكشر عتبة'],
    ['shear_stress_beams', 'إجهادات القص في العتبات (Shear Stress in Beams)', 'shear stress beam', 'theory solved', 'قص عتبة شير'],
    ['deflection_theory', 'انحراف العتبات بطريقة التكامل المزدوج', 'beam deflection', 'solved theory', 'انحراف تكامل مزدوج دفلكشن'],
    ['torsion_theory', 'الالتواء في الأعمدة الدائرية (Torsion of Shafts)', 'drive shaft', 'theory solved summary', 'التواء عمود دوار شافت قدرة'],
    ['mohr_circle', 'تحويل الإجهادات ودائرة موهر (Mohr\'s Circle)', 'Mohr circle', 'solved theory summary', 'موهر مور دائرة رئيسية الاجهادات الرئيسية'],
    ['thin_vessels', 'الأوعية الضغطية رقيقة الجدران (Thin-Walled Pressure Vessels)', 'pressure vessel', 'theory solved', 'اوعية رقيقة اسطوانة خزان ضغط'],
    ['combined_loading', 'الأحمال المركبة (Combined Loading)', 'eccentric load column', 'theory solved', 'مركب لامركزي لا مركزي'],
  ],
  math: [
    ['ode_first', 'المعادلات التفاضلية من الرتبة الأولى', 'differential equation slope field', 'theory solved summary', 'تفاضلية رتبة اولى فصل المتغيرات متجانسة تامة خطية برنولي'],
    ['ode_second', 'المعادلات التفاضلية الخطية من الرتبة الثانية بمعاملات ثابتة', 'damped oscillation', 'theory solved summary', 'رتبة ثانية معاملات ثابتة متجانسة المعادلة المساعدة'],
    ['undetermined_coeff', 'طريقة المعاملات غير المحددة', 'undetermined coefficients', 'solved theory', 'معاملات غير محددة الحل الخاص'],
    ['variation_params', 'طريقة تغيير الوسائط (Variation of Parameters)', 'variation of parameters', 'solved theory', 'تغيير الوسائط الوسطاء رونسكيان'],
    ['laplace', 'تحويلات لابلاس وحل المعادلات التفاضلية', 'Pierre-Simon Laplace', 'theory solved summary applications', 'لابلاس لابلاز تحويل معكوس'],
    ['fourier', 'متسلسلات فورير (Fourier Series)', 'Fourier series square wave', 'theory solved summary applications', 'فورير فوريه متسلسلة دورية'],
    ['series', 'المتسلسلات اللانهائية ومتسلسلات تايلر وماكلورين', 'Taylor series approximation', 'theory solved summary', 'متسلسلة متسلسلات تايلر ماكلورين تقارب قوى'],
    ['partial_deriv', 'الدوال متعددة المتغيرات والمشتقات الجزئية', 'partial derivative surface', 'theory solved summary', 'مشتقة جزئية متعددة المتغيرات قاعدة السلسلة'],
    ['multiple_integrals', 'التكاملات الثنائية والثلاثية وتطبيقاتها', 'double integral volume', 'theory solved applications', 'تكامل ثنائي ثلاثي مساحة حجم'],
    ['vectors', 'المتجهات: الضرب النقطي والضرب الاتجاهي', 'cross product vectors', 'theory solved summary', 'متجه متجهات ضرب نقطي اتجاهي فكتور'],
    ['vector_calculus', 'حساب المتجهات: التدرج والتباعد والالتفاف', 'vector field', 'theory solved', 'تدرج تباعد التفاف كريدينت دايفرجنس كيرل'],
    ['matrices', 'المصفوفات والمحددات وحل أنظمة المعادلات الخطية', 'matrix', 'theory solved summary', 'مصفوفة مصفوفات محددة كرامر كاوس معكوس'],
    ['eigen', 'القيم الذاتية والمتجهات الذاتية', 'eigenvector', 'theory solved', 'ذاتية ايكن القيم الذاتية'],
    ['complex', 'الأعداد المركبة (Complex Numbers)', 'complex plane', 'theory solved summary', 'مركبة عقدية تخيلي ديموافر'],
    ['numerical', 'الطرق العددية: نيوتن–رافسون وقاعدة سمبسون', 'Newton method', 'theory solved', 'عددية نيوتن رافسون سمبسون شبه المنحرف'],
    ['ode_applications', 'تطبيقات المعادلات التفاضلية في الهندسة المدنية', 'cantilever beam deflection', 'applications theory', 'تطبيقات تفاضلية'],
    ['pde', 'المعادلات التفاضلية الجزئية وطريقة فصل المتغيرات', 'heat equation', 'theory solved', 'تفاضلية جزئية حرارة موجة'],
    ['hyperbolic', 'الدوال الزائدية وتطبيقاتها (Hyperbolic Functions)', 'catenary', 'theory solved applications', 'زائدية هايبربولك كتناري سلسلة معلقة'],
  ],
  concrete: [
    ['cement_fineness', 'فحص نعومة الإسمنت (المنخل وجهاز بلين)', 'Blaine air permeability apparatus', 'lab discussion', 'نعومة بلين سمنت سمنتو السطح النوعي'],
    ['cement_density', 'فحص الكثافة النوعية للإسمنت', 'Le Chatelier flask', 'lab discussion', 'كثافة وزن نوعي سمنت قنينة لوشاتلييه'],
    ['cement_consistency', 'فحص القوام القياسي لعجينة الإسمنت', 'Vicat apparatus', 'lab discussion', 'قوام قياسي سمنت فيكات عجينة'],
    ['cement_setting', 'فحص زمن التماسك الابتدائي والنهائي للإسمنت', 'Vicat needle setting time', 'lab discussion', 'تماسك ابتدائي نهائي سمنت فيكات'],
    ['cement_soundness', 'فحص ثبات حجم الإسمنت (لوشاتلييه والأوتوكليف)', 'Le Chatelier soundness mould', 'lab discussion', 'ثبات الحجم لوشاتلييه اوتوكليف سمنت'],
    ['mortar_strength', 'فحص مقاومة الانضغاط لمكعبات مونة الإسمنت', 'cement mortar cubes', 'lab discussion', 'مونة مكعبات سمنت انضغاط'],
    ['agg_sieve', 'التحليل المنخلي للركام الناعم والخشن', 'sieve analysis aggregate', 'lab discussion', 'تحليل منخلي مناخل تدرج رمل حصو ركام سيف'],
    ['agg_sg_coarse', 'فحص الوزن النوعي والامتصاص للركام الخشن', 'coarse aggregate', 'lab discussion', 'وزن نوعي امتصاص حصو ركام خشن'],
    ['agg_sg_fine', 'فحص الوزن النوعي والامتصاص للركام الناعم', 'pycnometer sand', 'lab discussion', 'وزن نوعي امتصاص رمل ركام ناعم'],
    ['agg_bulk_density', 'فحص الكثافة الكتلية ونسبة الفراغات في الركام', 'aggregate bulk density', 'lab discussion', 'كثافة كتلية فراغات وزن وحدة'],
    ['agg_moisture', 'فحص المحتوى الرطوبي للركام', 'aggregate stockpile', 'lab discussion', 'رطوبة ركام'],
    ['agg_fines', 'فحص المواد الناعمة المارة من منخل 75 مايكرون (الطين والغرين)', 'aggregate washing sieve', 'lab discussion', 'مواد ناعمة طين غرين غسل 200'],
    ['agg_sulfate', 'فحص محتوى الأملاح الكبريتية (SO3) في الركام', 'gypsum crystals', 'lab discussion', 'كبريتات املاح SO3 ركام جبس'],
    ['la_abrasion', 'فحص مقاومة البري بجهاز لوس أنجلوس', 'Los Angeles abrasion machine', 'lab discussion', 'بري لوس انجلوس تآكل'],
    ['impact_value', 'فحص قيمة الصدم للركام', 'aggregate impact value apparatus', 'lab discussion', 'صدم ركام'],
    ['slump', 'فحص الهطول للخرسانة الطرية (Slump Test)', 'concrete slump test', 'lab discussion summary', 'هطول سلمب سلم قابلية التشغيل تشغيلية كونكريت طري'],
    ['compacting_factor', 'فحص معامل الرص للخرسانة الطرية', 'compacting factor apparatus', 'lab discussion compare', 'معامل الرص الدمك قابلية التشغيل'],
    ['vebe', 'فحص فيبي (Vebe) لقوام الخرسانة', 'Vebe consistometer', 'lab discussion', 'فيبي قوام اهتزاز'],
    ['fresh_density', 'فحص كثافة الخرسانة الطرية (وزن وحدة الحجم)', 'fresh concrete', 'lab discussion', 'كثافة وزن وحدة حجم'],
    ['air_content', 'فحص المحتوى الهوائي للخرسانة الطرية', 'concrete air meter', 'lab discussion', 'هواء محبوس فقاعات مسامية'],
    ['cube_strength', 'فحص مقاومة الانضغاط للمكعبات الخرسانية', 'concrete cube compression test', 'lab discussion summary', 'كسر مكعبات انضغاط مقاومة كونكريت مكعب 28 يوم'],
    ['splitting_tensile', 'فحص مقاومة الشد بالانفلاق (الفحص البرازيلي)', 'splitting tensile test cylinder', 'lab discussion', 'شد انفلاق برازيلي اسطوانة'],
    ['flexural', 'فحص مقاومة الانثناء للعتبات الخرسانية (معامل الكسر)', 'concrete flexural strength test', 'lab discussion', 'انثناء انحناء معامل الكسر عتبة موشور'],
    ['rebound_hammer', 'فحص مطرقة شميدت (الارتداد)', 'Schmidt rebound hammer', 'lab discussion', 'مطرقة شميدت ارتداد'],
    ['upv', 'فحص سرعة الأمواج فوق الصوتية (UPV)', 'ultrasonic pulse velocity concrete', 'lab discussion', 'امواج فوق صوتية'],
    ['mix_aci', 'تصميم الخلطة الخرسانية بالطريقة الأمريكية (ACI 211.1)', 'concrete mixing', 'project lab theory', 'تصميم خلطة خلطات نسب الخلط امريكية'],
    ['mix_doe', 'تصميم الخلطة الخرسانية بالطريقة البريطانية (DoE)', 'concrete mixer laboratory', 'project lab theory', 'تصميم خلطة بريطانية'],
    ['cement_manufacture', 'صناعة الإسمنت البورتلاندي ومراحلها', 'cement kiln', 'theory visit summary', 'صناعة معمل سمنت فرن كلنكر'],
    ['cement_compounds', 'مركبات الإسمنت وتفاعلات الإماهة', 'cement hydration', 'theory summary', 'مركبات بوك اماهة اماهه C3S C2S'],
    ['cement_types', 'أنواع الإسمنت واستعمالاتها', 'cement bags', 'theory summary compare', 'انواع سمنت مقاوم للاملاح'],
    ['workability', 'قابلية التشغيل والعوامل المؤثرة فيها', 'workable concrete', 'theory summary', 'تشغيلية قابلية التشغيل وركبلتي'],
    ['segregation_bleeding', 'الانعزال والنزف في الخرسانة الطرية', 'concrete bleeding', 'theory summary compare', 'انعزال نزف نضح'],
    ['admixtures', 'المضافات الكيميائية للخرسانة (الملدنات والمؤخرات والمعجلات)', 'concrete admixture', 'theory summary', 'مضافات ملدن ملدنات مؤخر معجل سوبر'],
    ['curing', 'معالجة الخرسانة (الإنضاج) وطرقها', 'concrete curing', 'theory summary', 'معالجة انضاج رش ماء ترطيب'],
    ['strength_factors', 'مقاومة الخرسانة والعوامل المؤثرة فيها', 'concrete compressive strength', 'theory summary', 'مقاومة نسبة الماء الى الاسمنت ابرامز'],
    ['durability', 'ديمومة الخرسانة ومهاجمة الكبريتات', 'concrete deterioration', 'theory summary', 'ديمومة كبريتات املاح تآكل'],
    ['hot_weather', 'صب الخرسانة في الأجواء الحارة', 'hot weather concreting', 'theory summary', 'حر صيف حرارة عالية'],
    ['shrinkage_creep', 'انكماش الخرسانة وزحفها', 'concrete shrinkage cracks', 'theory compare', 'انكماش زحف'],
    ['special_concrete', 'أنواع الخرسانة الخاصة (خفيفة، ذاتية الرص، عالية المقاومة، بالألياف)', 'self-compacting concrete', 'theory compare seminar', 'خاصة خفيفة ذاتية الرص الياف عالية المقاومة'],
  ],
  survey: [
    ['pacing', 'القياس بالخطوة (Pacing)', 'pacing distance', 'field discussion', 'خطوة خطوات بيسنك'],
    ['taping', 'قياس المسافات بالشريط وتصحيحاته (Taping)', 'surveying tape measure', 'field discussion solved', 'شريط تيب تصحيحات قياس مسافة'],
    ['ranging_offsets', 'مدّ الخطوط المستقيمة وإقامة الأعمدة (Ranging and Offsets)', 'ranging rods surveying', 'field discussion', 'شواخص اعمدة اوفسيت تعامد 3-4-5'],
    ['chain_survey', 'المسح بالشريط لقطعة أرض (Chain Survey)', 'chain surveying field', 'field project', 'مسح شريط جين سرفي قطعة ارض'],
    ['leveling_diff', 'التسوية التفاضلية بجهاز الليفل (Differential Leveling)', 'automatic level surveying', 'field discussion solved', 'تسوية ليفل منسوب ليفلنك'],
    ['leveling_profile', 'التسوية الطولية والمقاطع العرضية', 'profile leveling', 'field project', 'مقطع طولي عرضي بروفايل'],
    ['two_peg', 'اختبار الوتدين لجهاز التسوية (Two-Peg Test)', 'two peg test level', 'field discussion', 'وتدين تو بك خطأ خط النظر'],
    ['reciprocal', 'التسوية المتبادلة (Reciprocal Leveling)', 'reciprocal leveling river', 'field solved', 'متبادلة ريسبروكل نهر'],
    ['compass', 'المضلع بالبوصلة المنشورية (Compass Traverse)', 'prismatic compass', 'field solved', 'بوصلة كومباص انحراف تجاذب محلي'],
    ['theodolite_angle', 'قياس الزوايا الأفقية بجهاز الثيودولايت', 'theodolite', 'field discussion', 'ثيودولايت زوايا افقية تكرار'],
    ['vertical_angle', 'قياس الزوايا الرأسية والارتفاعات (Trigonometric Leveling)', 'theodolite vertical angle', 'field solved', 'زوايا راسية عمودية ارتفاع مبنى مثلثية'],
    ['traverse', 'المضلع بالثيودولايت وتصحيحه بطريقة بوديتش', 'traverse survey', 'field solved project', 'مضلع ترافرس احداثيات بوديتش'],
    ['tacheometry', 'المسح التاكيومتري (Stadia Tacheometry)', 'stadia rod', 'field solved', 'تاكيومتري ستاديا'],
    ['contouring', 'رسم خطوط الكنتور بطريقة الشبكة', 'contour map', 'field project', 'كنتور خطوط تساوي المناسيب شبكة'],
    ['total_station', 'المسح بجهاز المحطة الشاملة (Total Station)', 'total station surveying', 'field discussion', 'توتل ستيشن محطة شاملة'],
    ['setting_out', 'توقيع المباني على الأرض (التسقيط)', 'setting out building', 'field theory', 'تسقيط توقيع'],
    ['area_calc', 'حساب المساحات والحجوم (Areas and Volumes)', 'earthwork', 'solved theory summary', 'مساحة مساحات حجوم سمبسون شبه المنحرف احداثيات'],
    ['survey_errors', 'الأخطاء في القياسات المساحية وأنواعها', 'surveying instrument', 'theory summary', 'اخطاء خطأ منتظم عرضي'],
    ['bearings', 'الاتجاهات والانحرافات (Bearings and Azimuths)', 'compass bearing', 'theory solved summary', 'انحراف اتجاه ازيموث بيرنك'],
    ['curvature_refraction', 'تأثير كروية الأرض والانكسار في التسوية', 'earth curvature', 'theory solved', 'كروية الارض انكسار'],
  ],
  fluids: [
    ['fluid_density', 'قياس الكثافة والوزن النوعي للسوائل', 'hydrometer', 'lab discussion', 'كثافة وزن نوعي هايدروميتر'],
    ['viscosity', 'قياس اللزوجة بطريقة الكرة الساقطة (Falling Sphere Viscometer)', 'falling ball viscometer', 'lab discussion', 'لزوجة فسكوستي ستوكس كرة'],
    ['bourdon', 'معايرة مقياس الضغط بوردن (Calibration of Bourdon Gauge)', 'Bourdon pressure gauge', 'lab discussion', 'بوردن معايرة ضغط ديد ويت'],
    ['center_pressure', 'مركز الضغط على سطح مستوٍ مغمور (Center of Pressure)', 'hydrostatic pressure apparatus', 'lab discussion solved', 'مركز الضغط قوة هيدروستاتيكية سطح مغمور'],
    ['metacentric', 'الارتفاع الميتاسنتري واستقرار الأجسام الطافية (Metacentric Height)', 'metacentric height apparatus', 'lab theory discussion', 'ميتاسنتري طفو استقرار عائم'],
    ['bernoulli', 'إثبات نظرية برنولي (Bernoulli\'s Theorem)', 'Bernoulli theorem apparatus', 'lab theory discussion', 'برنولي طاقة'],
    ['venturi', 'مقياس فنتوري (Venturi Meter)', 'venturi meter', 'lab discussion solved', 'فنتوري فينشوري معامل التصريف'],
    ['orifice', 'الجريان خلال الفتحات (Flow through an Orifice)', 'orifice jet flow', 'lab discussion solved', 'فتحة اورفس فوهة معامل التقلص السرعة'],
    ['weir', 'الجريان فوق الهدارات (Flow over Weirs)', 'V-notch weir', 'lab discussion', 'هدار هدارات وير نوتش معامل تصريف'],
    ['reynolds', 'تجربة رينولدز (Reynolds Experiment)', 'Reynolds experiment dye', 'lab discussion theory', 'رينولدز رقم رينولدز طباقي مضطرب'],
    ['pipe_friction', 'خسائر الاحتكاك في الأنابيب (Friction Loss in Pipes)', 'pipe friction apparatus', 'lab discussion solved', 'احتكاك خسائر فقدان انابيب دارسي'],
    ['minor_losses', 'الخسائر الثانوية في الأنابيب (Minor Losses)', 'pipe fittings', 'lab discussion solved', 'خسائر ثانوية موضعية اكواع صمامات'],
    ['jet_impact', 'اصطدام النفث بالأسطح (Impact of Jet)', 'impact of jet apparatus', 'lab theory discussion', 'نفث جت اصطدام زخم'],
    ['fluid_props', 'خواص الموائع (Fluid Properties)', 'water droplet surface tension', 'theory summary solved', 'خواص كثافة لزوجة توتر سطحي انضغاطية'],
    ['pressure_manometers', 'الضغط ومقاييسه والمانومترات', 'U-tube manometer', 'theory solved summary', 'ضغط مانوميتر مانومتر بيزوميتر'],
    ['hydrostatic_forces', 'القوى الهيدروستاتيكية على الأسطح المستوية والمنحنية', 'dam water pressure', 'theory solved summary', 'قوى هيدروستاتيكية سطح منحني سد بوابة'],
    ['continuity', 'حركة الموائع ومعادلة الاستمرارية', 'streamlines flow', 'theory solved summary', 'استمرارية حركة خطوط الانسياب جريان منتظم'],
    ['dimensional', 'التحليل البعدي ونظرية باي (Dimensional Analysis)', 'scale model hydraulic', 'theory solved', 'بعدي ابعاد باكنغهام باي نماذج'],
    ['pipes_network', 'الأنابيب على التوالي والتوازي', 'water pipes', 'solved theory', 'انابيب توالي توازي شبكات'],
  ],
};

/** صنف العنوان من نوعه الأول. */
function kindOf(firstType) {
  if (firstType === 'lab') return 'lab';
  if (firstType === 'field') return 'field';
  return 'theory';
}

/** يحوّل الصفوف المختصرة إلى كائنات. */
export const TOPICS = Object.entries(RAW).flatMap(([cat, rows]) =>
  rows.map(([id, title, en, types, kw]) => {
    const list = types.split(' ');
    return { id, title, en, cat, types: list, kind: kindOf(list[0]), kw: kw || '' };
  }));

export const TOPIC_BY_ID = Object.fromEntries(TOPICS.map((t) => [t.id, t]));

export function topicsOf(cat) {
  return TOPICS.filter((t) => t.cat === cat);
}

/** أسماء الأصناف كما تظهر للطالب. */
export const KINDS = [
  { id: 'lab', label: 'تجارب المختبر' },
  { id: 'field', label: 'الأعمال الحقلية' },
  { id: 'theory', label: 'مواضيع نظرية' },
];
