<?php

declare(strict_types=1);

namespace MauticPlugin\GrapesJsBuilderBundle\Tests\Unit\Model;

use Doctrine\ORM\EntityManager;
use Mautic\CoreBundle\Helper\CoreParametersHelper;
use Mautic\CoreBundle\Helper\UserHelper;
use Mautic\CoreBundle\Security\Permissions\CorePermissions;
use Mautic\CoreBundle\Translation\Translator;
use Mautic\EmailBundle\Entity\Email;
use Mautic\EmailBundle\Entity\EmailRepository;
use Mautic\EmailBundle\Model\EmailModel;
use Mautic\PageBundle\Entity\Page;
use MauticPlugin\GrapesJsBuilderBundle\Entity\GrapesJsBuilder;
use MauticPlugin\GrapesJsBuilderBundle\Entity\GrapesJsBuilderRepository;
use MauticPlugin\GrapesJsBuilderBundle\Model\GrapesJsBuilderModel;
use PHPUnit\Framework\Assert;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;
use Symfony\Bundle\FrameworkBundle\Routing\Router;
use Symfony\Component\EventDispatcher\EventDispatcherInterface;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\RequestStack;

final class GrapesJsBuilderModelEditorStateTest extends TestCase
{
    public function testAddOrEditEntityStoresDecodedEditorStateAndCustomHtmlFallback(): void
    {
        $requestStack = new class extends RequestStack {
            public function __construct()
            {
            }

            public function getCurrentRequest(): Request
            {
                return new Request([], [
                    'grapesjsbuilder' => [
                        'customMjml'  => '<mjml/>',
                        'editorState' => '{"pages":[{"id":"main"}]}',
                    ],
                    'customHtml' => '<html/>',
                ]);
            }
        };

        $emailRepository = new class extends EmailRepository {
            public ?Email $savedEntity = null;

            public function __construct()
            {
            }

            public function saveEntity($entity, $flush = true): void
            {
                $this->savedEntity = $entity;
            }
        };

        $grapesRepository = new class extends GrapesJsBuilderRepository {
            public function __construct()
            {
            }

            public function findOneBy(array $criteria, ?array $orderBy = null)
            {
                return null;
            }

            public function saveEntity($entity, $flush = true): void
            {
                Assert::assertSame('<mjml/>', $entity->getCustomMjml());
            }
        };

        $entityManager = $this->getEntityManager($grapesRepository);
        $model         = $this->getModel($requestStack, $emailRepository, $entityManager, false);

        $email = new Email();
        $email->setContent(['existing' => true]);

        $model->addOrEditEntity($email);

        Assert::assertSame('<html/>', $email->getCustomHtml());
        Assert::assertNotNull($emailRepository->savedEntity);
        Assert::assertSame(['pages' => [['id' => 'main']]], $email->getContent()['grapesjsbuilder']['editorState']);
        Assert::assertArrayHasKey('updatedAt', $email->getContent()['grapesjsbuilder']);
    }

    public function testAddOrEditEntitySkipsWhenTranslationChildrenAreUpdating(): void
    {
        $requestStack = new class extends RequestStack {
            public function __construct()
            {
            }

            public function getCurrentRequest(): Request
            {
                return new Request([], [
                    'grapesjsbuilder' => [
                        'customMjml'  => '<mjml/>',
                        'editorState' => '{"pages":[]}',
                    ],
                ]);
            }
        };

        $emailRepository = new class extends EmailRepository {
            public int $saveCalls = 0;

            public function __construct()
            {
            }

            public function saveEntity($entity, $flush = true): void
            {
                ++$this->saveCalls;
            }
        };

        $grapesRepository = new class extends GrapesJsBuilderRepository {
            public int $saveCalls = 0;

            public function __construct()
            {
            }

            public function findOneBy(array $criteria, ?array $orderBy = null)
            {
                return null;
            }

            public function saveEntity($entity, $flush = true): void
            {
                ++$this->saveCalls;
            }
        };

        $entityManager = $this->getEntityManager($grapesRepository);
        $model         = $this->getModel($requestStack, $emailRepository, $entityManager, true);

        $model->addOrEditEntity(new Email());

        Assert::assertSame(0, $emailRepository->saveCalls);
        Assert::assertSame(0, $grapesRepository->saveCalls);
    }

    public function testAddOrEditPageEntityPersistsOnlyWhenEditorStateProvided(): void
    {
        $requestStackWithEditorState = new class extends RequestStack {
            public function __construct()
            {
            }

            public function getCurrentRequest(): Request
            {
                return new Request([], [
                    'grapesjsbuilder' => [
                        'editorState' => ['pages' => [['id' => 'landing']]],
                    ],
                ]);
            }
        };

        $grapesRepository = new class extends GrapesJsBuilderRepository {
            public function __construct()
            {
            }
        };

        $entityManager = new class($grapesRepository) extends EntityManager {
            public int $persistCalls = 0;
            public int $flushCalls   = 0;

            public function __construct(
                private GrapesJsBuilderRepository $grapesJsBuilderRepository,
            ) {
            }

            public function persist($object): void
            {
                ++$this->persistCalls;
            }

            public function flush($entity = null): void
            {
                ++$this->flushCalls;
            }

            public function getRepository($entityName)
            {
                Assert::assertSame(GrapesJsBuilder::class, $entityName);

                return $this->grapesJsBuilderRepository; // @phpstan-ignore-line
            }
        };

        $emailRepository = new class extends EmailRepository {
            public function __construct()
            {
            }
        };

        $model = $this->getModel($requestStackWithEditorState, $emailRepository, $entityManager, false);
        $page  = new Page();
        $page->setContent(['existing' => 'value']);

        $model->addOrEditPageEntity($page);

        Assert::assertSame(1, $entityManager->persistCalls);
        Assert::assertSame(1, $entityManager->flushCalls);
        Assert::assertSame(['pages' => [['id' => 'landing']]], $page->getContent()['grapesjsbuilder']['editorState']);

        $requestStackWithoutEditorState = new class extends RequestStack {
            public function __construct()
            {
            }

            public function getCurrentRequest(): Request
            {
                return new Request([], [
                    'grapesjsbuilder' => [
                        'customMjml' => '<mjml/>',
                    ],
                ]);
            }
        };

        $modelWithoutEditorState = $this->getModel($requestStackWithoutEditorState, $emailRepository, $entityManager, false);
        $modelWithoutEditorState->addOrEditPageEntity(new Page());

        Assert::assertSame(1, $entityManager->persistCalls);
        Assert::assertSame(1, $entityManager->flushCalls);
    }

    private function getEntityManager(GrapesJsBuilderRepository $grapesJsBuilderRepository): EntityManager
    {
        return new class($grapesJsBuilderRepository) extends EntityManager {
            public function __construct(
                private GrapesJsBuilderRepository $grapesJsBuilderRepository,
            ) {
            }

            public function getRepository($entityName)
            {
                Assert::assertSame(GrapesJsBuilder::class, $entityName);

                return $this->grapesJsBuilderRepository; // @phpstan-ignore-line
            }
        };
    }

    private function getModel(
        RequestStack $requestStack,
        EmailRepository $emailRepository,
        EntityManager $entityManager,
        bool $isUpdatingTranslationChildren,
    ): GrapesJsBuilderModel {
        $emailModel = new class($emailRepository, $isUpdatingTranslationChildren) extends EmailModel {
            public function __construct(
                private EmailRepository $emailRepository,
                private bool $isUpdatingTranslationChildren,
            ) {
            }

            public function getRepository(): EmailRepository
            {
                return $this->emailRepository;
            }

            public function isUpdatingTranslationChildren(): bool
            {
                return $this->isUpdatingTranslationChildren;
            }
        };

        return new GrapesJsBuilderModel(
            $requestStack,
            $emailModel,
            $entityManager,
            $this->createMock(CorePermissions::class),
            $this->createMock(EventDispatcherInterface::class),
            $this->createMock(Router::class),
            new class extends Translator {
                public function __construct()
                {
                }
            },
            $this->createMock(UserHelper::class),
            $this->createMock(LoggerInterface::class),
            $this->createMock(CoreParametersHelper::class)
        );
    }
}
